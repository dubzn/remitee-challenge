# CLI wallets and optional testnet verification

The challenge's API/indexer observes events and never signs transactions. A CLI signer is a wallet integration for the demonstration; a browser wallet UI, WalletConnect or API custody is outside scope. Foundry's cast supports signing and contract calls; encrypted keystore accounts keep signing material outside this repository. [Foundry Cast](https://www.getfoundry.sh/cast/index.html), [wallet command reference](https://foundry-rs.github.io/foundry/cast/cmd/wallet/enum.WalletSubcommands.html).

## Local versus public network

Local acceptance uses Anvil unlocked test accounts on an isolated chain. Optional public smoke testing can use Sepolia, currently recommended for application development in [Ethereum's network documentation](https://ethereum.org/developers/docs/networks/). Configure a Sepolia RPC and fund two dedicated test accounts with test ETH for gas: sender/deployer and beneficiary. A separate PostgreSQL database/schema is required. No testnet transaction has been broadcast by this task.

The commands below are a manual runbook, not an executed testnet claim. Wallet/account, RPC and broadcast flags were checked against pinned Foundry 1.4.1 CLI help. Use that version natively, or invoke its pinned container with the contract sources and your own keystore outside the observer. Do not use Anvil's publicly known accounts on a public network.

## External accounts and deployment

Create/import the two accounts interactively in your own terminal. Do not paste keys or passwords into the chat, repository or indexer configuration.

```sh
cast wallet import remitee-sender --interactive
cast wallet import remitee-beneficiary --interactive
```

Set RPC_URL in your shell to the testnet endpoint, then deploy the unchanged contract and a disposable test-only token:

```sh
cd contracts
forge create src/Escrow.sol:Escrow --rpc-url "$RPC_URL" --account remitee-sender --broadcast
forge create test/mocks/MockERC20.sol:MockERC20 --rpc-url "$RPC_URL" --account remitee-sender --broadcast
cd ..
```

Record the printed Escrow address/deployment transaction, token address and both wallet addresses. Use them as ESCROW_ADDRESS, ESCROW_DEPLOY_TX, TOKEN_ADDRESS, SENDER_ADDRESS and BENEFICIARY_ADDRESS below. The mock allows unrestricted minting and is only a demonstration asset.

Create the indexer's descriptor by checking deployment receipt and runtime code against the compiled contract:

```sh
npm run indexer:manifest -- "$ESCROW_ADDRESS" "$ESCROW_DEPLOY_TX" .local/sepolia-deployment.json
```

Set DEPLOYMENT_FILE to that file, DATABASE_URL to a separate testnet database, INDEXER_SCHEMA to sepolia_escrow, and retain an explicit confirmation/recovery policy. Start with `npm run indexer:start`. The application reads chain ID from the validated descriptor; no Anvil account or signing key enters this process. Two additional blocks is a demonstration admission delay, not a production finality choice.

## Signed lifecycle smoke

The sender mints test tokens, approves Escrow and creates an escrow for the beneficiary:

```sh
cast send "$TOKEN_ADDRESS" 'mint(address,uint256)' "$SENDER_ADDRESS" 100000000000000000000 --rpc-url "$RPC_URL" --account remitee-sender
cast send "$TOKEN_ADDRESS" 'approve(address,uint256)' "$ESCROW_ADDRESS" 100000000000000000000 --rpc-url "$RPC_URL" --account remitee-sender
cast send "$ESCROW_ADDRESS" 'createEscrow(address,address,uint256)' "$BENEFICIARY_ADDRESS" "$TOKEN_ADDRESS" 1000000000000000000 --rpc-url "$RPC_URL" --account remitee-sender
```

Read the emitted EscrowCreated ID from the receipt; use it as ESCROW_ID. Wait for the configured additional blocks and compare the on-chain getter, token balances and observation endpoint. Then the beneficiary signs confirmation:

```sh
cast send "$ESCROW_ADDRESS" 'confirmEscrow(uint256)' "$ESCROW_ID" --rpc-url "$RPC_URL" --account remitee-beneficiary
curl http://127.0.0.1:42069/observed/escrows
```

For cancellation and rejection, create separate escrows first. The sender calls cancelEscrow before its two-hour deadline; the beneficiary calls rejectEscrow before its seven-day expiry. Never reuse an already terminal escrow or automatically resend creation with a new nonce. These are independent transactions requiring the appropriate signer.

## Time and acceptance limits

Public testnets do not accept Anvil's timestamp/mining controls. recoverExpiredEscrow requires seven actual days after creation; the seven-day recovery path and exact boundaries remain deterministic local acceptance. Do not shorten the approved constants just for a testnet demonstration. The public smoke complements local tests and cannot replace controlled crash, fork and expiry cases.

A browser wallet could later sign the same ABI calls while using the read API for discovery. That adds a UI/transaction UX and stays outside this week's deliverable. No key-management service or backend transaction queue is required for the selected CLI demonstration.
