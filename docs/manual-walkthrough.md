# Manual walkthrough with two wallets

Run each block from the repository root in the same Bash or Zsh terminal. Docker executes the pinned `cast` and Node commands; no host Foundry, Node or wallet UI is needed.

Stop if a command reports an error. In particular, do not retry creation until its transaction outcome is known: another successful creation locks another deposit.

The sender signs approval and creation. The beneficiary signs `confirmEscrow`, which is the claim: it immediately transfers the tokens to the beneficiary. The API only observes these transactions.

## Start and select the accounts

```sh
git submodule update --init --depth 1
docker compose --profile app up --build --wait --wait-timeout 120
```

Use Anvil's public test mnemonic and its first two funded accounts. These accounts are for this local chain only; never use them for real funds or on a public network.

```sh
set -o pipefail
MNEMONIC='test test test test test test test test test test test junk'
API_URL="http://127.0.0.1:${API_PORT:-3000}"

cast_rpc() {
  docker compose --profile app exec -T anvil cast "$@" --rpc-url http://127.0.0.1:8545
}

token_balance() {
  cast_rpc call "$TOKEN" 'balanceOf(address)(uint256)' "$1" | cut -d ' ' -f 1
}

SENDER=$(docker compose --profile app exec -T anvil cast wallet address --mnemonic "$MNEMONIC" --mnemonic-index 0)
BENEFICIARY=$(docker compose --profile app exec -T anvil cast wallet address --mnemonic "$MNEMONIC" --mnemonic-index 1)
ESCROW=$(docker compose --profile app exec -T application node -p 'JSON.parse(require("node:fs").readFileSync("/state/deployment.json", "utf8")).address')
TOKEN=$(docker compose --profile app exec -T application node -p 'JSON.parse(require("node:fs").readFileSync("/state/deployment.json", "utf8")).localTokenAddress')
CONFIRMATION_DELAY=$(docker compose --profile app exec -T application printenv CONFIRMATION_DELAY)
AMOUNT=1000000000000000000

printf 'Sender: %s\nBeneficiary: %s\nEscrow: %s\nToken: %s\n' "$SENDER" "$BENEFICIARY" "$ESCROW" "$TOKEN"
curl -fsS "$API_URL/health"
```

The addresses should start with `0xf39F` (sender) and `0x7099` (beneficiary). `AMOUNT` is one TEST token, expressed in its 18-decimal raw units. Commands below sign with different mnemonic indexes; they do not use unlocked RPC transaction submission.

## Fund and approve as sender

The deployed mock token permits unrestricted minting for demonstrations. Mint one token, then authorize the escrow to transfer it:

```sh
cast_rpc send "$TOKEN" 'mint(address,uint256)' "$SENDER" "$AMOUNT" --mnemonic "$MNEMONIC" --mnemonic-index 0
cast_rpc send "$TOKEN" 'approve(address,uint256)' "$ESCROW" "$AMOUNT" --mnemonic "$MNEMONIC" --mnemonic-index 0

SENDER_BEFORE=$(token_balance "$SENDER")
BENEFICIARY_BEFORE=$(token_balance "$BENEFICIARY")
ESCROW_BEFORE=$(token_balance "$ESCROW")
printf 'Before creation: sender=%s beneficiary=%s escrow=%s\n' "$SENDER_BEFORE" "$BENEFICIARY_BEFORE" "$ESCROW_BEFORE"
```

These variables record the starting balances. Existing demos may have left earlier balances or pending deposits, so compare changes rather than assuming zero.

## Create as sender

Create the escrow and capture its ID from `EscrowCreated` in the successful receipt. The parser uses the built contract ABI; it does not assume ID 1 or discover the ID through a delayed API query.

```sh
ESCROW_ID=$(cast_rpc send "$ESCROW" 'createEscrow(address,address,uint256)' "$BENEFICIARY" "$TOKEN" "$AMOUNT" --mnemonic "$MNEMONIC" --mnemonic-index 0 --json |
  docker compose --profile app exec -T application node -e '
    const { readFileSync } = require("node:fs");
    const { parseEventLogs } = require("viem");
    const receipt = JSON.parse(readFileSync(0, "utf8"));
    const { abi } = JSON.parse(readFileSync("/app/artifacts/Escrow.json", "utf8"));
    const [created] = parseEventLogs({ abi, eventName: "EscrowCreated", logs: receipt.logs });
    if (!created) throw new Error("Successful creation event not found; inspect the transaction before retrying");
    console.log(created.args.id.toString());
  ')
if [ -n "$ESCROW_ID" ]; then
  printf 'Created escrow %s\n' "$ESCROW_ID"
else
  printf 'STOP: no escrow ID. Inspect the transaction before retrying creation.\n' >&2
fi
```

Continue only after a positive ID is printed:

```sh
cast_rpc call "$ESCROW" 'getEscrow(uint256)((address,address,address,uint256,uint64,uint64,uint64,uint8))' "$ESCROW_ID"
cast_rpc call "$TOKEN" 'balanceOf(address)(uint256)' "$SENDER"
cast_rpc call "$TOKEN" 'balanceOf(address)(uint256)' "$ESCROW"
```

The getter ends in status `0` (Pending). Creation decreases the sender balance by `AMOUNT` and increases the escrow balance by the same amount. Approval itself moves no tokens.

Anvil mines transactions immediately but produces no empty blocks while idle. Mine the configured extra blocks so Ponder can index the creation:

```sh
cast_rpc rpc anvil_mine "$CONFIRMATION_DELAY"
curl -sS "$API_URL/escrows/$ESCROW_ID"
curl -sS "$API_URL/escrows?sender=$SENDER&beneficiary=$BENEFICIARY&status=Pending&limit=20"
```

Allow a few seconds for polling, then repeat the GET if necessary. Expect `onChainStatus` and `effectiveStatus` to be `Pending`, `canCancel: true`, `canRecover: false`, a creation transaction hash and a null resolution hash. A temporary 404 means the creation is not indexed yet; it is not a reason to submit another creation.

## Claim as beneficiary

Index 1 signs confirmation. No approval from the beneficiary is needed:

```sh
cast_rpc send "$ESCROW" 'confirmEscrow(uint256)' "$ESCROW_ID" --mnemonic "$MNEMONIC" --mnemonic-index 1

cast_rpc call "$ESCROW" 'getEscrow(uint256)((address,address,address,uint256,uint64,uint64,uint64,uint8))' "$ESCROW_ID"
cast_rpc call "$TOKEN" 'balanceOf(address)(uint256)' "$SENDER"
cast_rpc call "$TOKEN" 'balanceOf(address)(uint256)' "$BENEFICIARY"
cast_rpc call "$TOKEN" 'balanceOf(address)(uint256)' "$ESCROW"

printf 'Sender: before=%s after=%s\n' "$SENDER_BEFORE" "$(token_balance "$SENDER")"
printf 'Beneficiary: before=%s after=%s\n' "$BENEFICIARY_BEFORE" "$(token_balance "$BENEFICIARY")"
printf 'Escrow: before=%s after=%s\n' "$ESCROW_BEFORE" "$(token_balance "$ESCROW")"

cast_rpc rpc anvil_mine "$CONFIRMATION_DELAY"
curl -sS "$API_URL/escrows/$ESCROW_ID"
curl -sS "$API_URL/escrows?beneficiary=$BENEFICIARY&status=Released&limit=20"
```

The getter ends in status `2` (Released). Relative to the balances recorded before creation, the sender has one token less, the beneficiary has one more, and the escrow is back to its previous balance. After indexing, both API statuses are `Released`, both eligibility flags are false, and the resolution hash matches the confirmation receipt.

## Try a rejected action

Once Released, the sender cannot cancel it. This command should fail with `EscrowNotPending`; it normally fails during gas estimation, before broadcasting:

```sh
cast_rpc send "$ESCROW" 'cancelEscrow(uint256)' "$ESCROW_ID" --mnemonic "$MNEMONIC" --mnemonic-index 0
```

Cast may print a custom error selector instead of its name: `0xde9fcd86` is `EscrowNotPending(uint256,uint8)`.

For a wrong-caller check, create another escrow using the funding, approval and creation steps, then try `confirmEscrow` with index 0. Expect `UnauthorizedCaller` (`0xacb067e8`); index 1 can still confirm afterward. Never repeat a creation just to retry indexing.

Use a separate new escrow for cancellation, rejection or expiry recovery. The [automated lifecycle demo](../README.md#run-locally) covers all four outcomes, including seven-day expiry. This manual claim does not advance time by seven days.

## Stop

```sh
docker compose --profile app down
```

The saved wallets' chain balances, deployment and records remain available after the next startup. No browser wallet or testnet deployment is required for submission.
