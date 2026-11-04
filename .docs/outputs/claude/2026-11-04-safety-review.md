I couldn't follow the plan-mode steps. I'm read-only, and I have no Write or ExitPlanMode tool, so I wrote no plan file. Note that `.docs/outputs/claude/2026-11-04-safety-review.md` is still empty; this reply is what should go in it.

# Consultation reply: confirmations, worker capacity, and pause (2026-11-04)

## What I checked in the sources
- **Challenge PDF:** an escrow is created by the sender at any time ("Siempre"). No one else, "not even the contract owner, can move funds from an escrow." Contract security is worth 30% and looks for "no way to lock or steal funds." Reorgs only need a README explanation, "e.g. wait N confirmations." Reorg handling also appears in the 15% API criterion. A deploy using constant or immutable time values is allowed.
- **SDD (`escrow.md`):** the contract has no owner, pause, upgrade or rescue (Authority row; AC3 says "No administrative escape path"). One ordered worker indexes up to `latest - confirmationDelay`, and a hash mismatch halts it (AC8). The local default is currently 0.
- **`.docs/spikes/002-indexing-recovery.md`:** says confirmations "do not guarantee finality or replace honest mismatch handling."

## 1. AC6 scope
I agree with the candidate. AC6 means watching and recording on-chain events, deduplicated and replay-safe. It does not mean executing transactions or retrying wallet actions. The current SDD text (§Event processing, "No wallet signing, transaction submission/retry queue") already says this, so no change is needed.

## 2. Block interval and how many workers
**From memory, not checked in this repo; Codex should confirm:** Ethereum mainnet has had 12-second slots since the Merge. A slot can be missed, so the gap between blocks is 12s or a multiple of it. Finalization normally takes about two epochs, roughly 13 minutes. Anvil mines a block only when a transaction arrives, unless it's started with `--block-time`.

**My judgement:** the block interval says nothing about how much one worker can handle. Capacity depends on:
- how many events fall in each range,
- `eth_getLogs` latency and the provider's range limits,
- how long the PostgreSQL commit takes.

The worker has to be ordered because events must be applied in sequence: an escrow's creation has to land before its resolution. The cursor CAS and the advisory lock also assume a single writer. For one contract address, one ordered writer is a defensible design, but this is reasoning, not a benchmark.

**If it's ever needed:** fetch the next K ranges concurrently over RPC, but commit them strictly in order. Each commit still re-checks the range-end hash and uses the same cursor CAS. If a hash changed, throw away the prefetched data. Never let several workers write to the projection in parallel.

**Evidence that would justify it:**
- steady-state lag (blocks and seconds) that keeps growing after catch-up,
- time per range, split into RPC fetch versus DB commit,
- events per range,
- time to catch up from the deployment block,
- RPC errors and range-limit splits.

Prefetch is only worth it if lag keeps growing and RPC fetch time dominates. **Status: not this week.**

## 3. Confirmations and AC8
Keep four terms separate:
- **observed:** the RPC head contains the block;
- **mined but unconfirmed:** depth below N;
- **eligible:** at least N blocks on top, and committed to the projection;
- **finalized:** consensus finality (the `finalized` block tag).

A finite N is a probabilistic cutoff. It doesn't rule out deeper reorgs, and it doesn't protect against an RPC provider that lies or is out of date. Confirmations reduce how often AC8's halt fires; they don't replace AC8.

**Watch the counting.** In this design N means blocks *after* the event's block. Wallet tools usually count the inclusion block as confirmation 1. **Assumption to check:** viem's `waitForTransactionReceipt({confirmations})` works that way, so delay N would equal N+1 viem confirmations. Document the convention explicitly.

**Worked timeline (N=2):**

| Head | What happens |
| --- | --- |
| 101 | Release tx mined in block 101 (depth 0). The API still shows Pending; `observedHead` is 101 and `indexedThrough` is 99. |
| 102 | Depth 1. Still not projected. |
| 103 | eligibleHead = 101. The range commits, the escrow becomes Released, and `indexedThrough` is 101. |

- If block 101 is reorged out before head 103, nothing was projected and nothing needs undoing.
- If it's reorged out after the commit, the AC8 hash check halts the worker and an explicit replay is required.
- "Finalized" is a separate, later point. Anvil has no consensus finality.

**Recommendation:**
- **Don't add a second "provisional" journal.** It would mean a new table, extra lifecycle states and a promote/discard step after reorgs. The existing `observedHead`, `indexedThrough`, `confirmationDelay` and lag fields already let a client that holds a tx hash compare its receipt block with `indexedThrough`.
- **Local default N=2, with 0 only as an explicit fast mode.** This works, but the demo script must mine the extra blocks (e.g. `anvil_mine`) or start Anvil with `--block-time`. Otherwise idle Anvil never makes the event eligible and the demo stalls.
- **Update the SDD Finality row**, which currently says local default 0.

## 4. Pause options

| Option | Effect on safety and liveness | If the admin key is compromised | Deviation from the challenge | What it actually contains | What stays exploitable |
| --- | --- | --- | --- | --- | --- |
| **(a) No pause** | Exits always remain open, subject to the token's own behavior. | No admin exists. | None. | Nothing. Users can only race the attacker to exit. | Any bug. Having no pause doesn't make a bug more likely. |
| **(b) Pause creation only** | Existing exits are untouched. | Attacker can only stop new escrows (denial of service). | Contradicts "Create: always"; must be documented as a deliberate deviation. | Bugs that need new deposits, such as deposit accounting or entry through a malicious token. It stops exposure from growing. | Every resolution-path bug on existing escrows. |
| **(c) Pause creation and release** | Beneficiaries can lose their window permanently: a pause that spans `expiresAt` turns a Released outcome into a sender recovery. | The admin can effectively decide that every escrow refunds to the sender. That is control over who receives funds, which conflicts with "ni siquiera el owner." | Changes the confirmation window. Extending deadlines would break the deadlines emitted in events, and with them AC5 and the API's derivation. | Only bugs in the release path. | Refund paths: an attacker with two addresses can create-and-reject or create-and-cancel immediately. |
| **(d) Pause every outflow** | Funds can be frozen for an unlimited time. | Ransom, or a permanent freeze if the key is lost. | Directly violates "sin forma de bloquear fondos." | Every withdrawal-path exploit, but only while paused. | The same bug comes back on unpause, because the contract is non-upgradeable. |

## 5. Gateway
- **Bypass:** if the escrow contract doesn't enforce the check inside every action, users can call it directly and skip the gateway.
- **Forwarding problem:** if the escrow accepts calls only from the gateway, `msg.sender` becomes the gateway. The escrow then has to trust a sender that the gateway asserts, ERC-2771 style. That lets the gateway act as any sender or beneficiary, i.e. a third party that can move funds, which the challenge forbids.
- **External controller:** making each action call out to a shared controller creates a new failure dependency. If that call reverts, runs out of gas, or the controller is upgraded or misconfigured, every escrow locks. One controller key would also have power over every deployment at once.
- **No gateway needed:** the challenge asks for one contract managing many IDs, so that contract is already the global switch for all escrows. "Across deployments" only matters if extra deployments are added, and the challenge doesn't require them.
- **Recommendation:** don't build a gateway or factory.

## 6. The TTL argument fails
Concrete scenario:
1. An escrow is created at t₀.
2. At t₀+1h, the pause is activated. Either an admin key is compromised, or a legitimate admin pauses and then loses the key.
3. At t₀+7d+1, the sender calls `recover()`. If `recover()` checks the pause, it reverts with `EnforcedPause`.

The elapsed TTL doesn't get around the check, because expiry only matters when someone calls the function. In the same scenario the sender also lost the 2-hour cancel window, and the beneficiary lost the right to confirm. "Funds can't lock because they expire" is only true if recovery is never paused.

If recovery is left unpaused (option c), any refund-path bug still works: for example, a double refund through reentrancy that drains other escrows' backing in the same token. Beneficiaries are also censored.

Pausing can't fix an unknown bug in a non-upgradeable contract. Getting funds out would need a migration or rescue path, and that is exactly the power the challenge forbids the owner to have.

Separately, the token itself can pause or blacklist the escrow contract regardless of our design; the SDD already notes this.

## 7. Recommendation
- **Implement (a).** It meets the challenge rules and the 30% security criterion most directly.
- Put (b) in the README as a trade-off for "with more time." It's the only option that doesn't reduce exit liveness.
- Reject (c), (d) and the gateway.

**One question must be settled before any pause is implemented:** which specific incident is it meant to contain, and does that justify departing from "Create: always" and "not even the owner"? If the answer is (b), also decide who holds the key, whether it's a multisig, and whether unpausing can be renounced.

## 8. ERC-20 scope
I agree: standard and no-return tokens, with a received-amount check, and no fee-on-transfer or rebasing tokens. This matches `.docs/spikes/001-token-compatibility.md`.

**Nothing in this reply is accepted scope.** The pause authority, extra deployments, a provisional event store and parallel workers all remain open questions for the candidate.

Claude usage remaining:
- Current session: 98% remaining · resets Nov 4 at 5:39am (America/Buenos_Aires)
- Current week (all models): 98% remaining · resets Nov 8 at 11:59am (America/Buenos_Aires)
