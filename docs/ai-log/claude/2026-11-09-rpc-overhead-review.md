**Verdict:** your counts hold, and removing identity from API reads is safe. Removing it from the indexer entirely is not, so `delayedRequest` should still run it when a new block appears. All numbers are estimates from source; I ran and measured nothing.

**Confirmed**
- A healthy `queryObservation` makes 14 RPCs: identity 5, latest 1, checkpoint 1, identity 5, checkpoint and head 2 (`read-model.ts:232-242`).
- An idle Ponder tick makes 7 (`rpc.ts:69-79`, `ponder/src/rpc/index.ts:731`), and a repeated head is a no-op (`sync-realtime/index.ts:1243`).
- Collapsing the checkpoint reads changes classification only. The snapshot still precedes both reads, which compare against captured values. A mid-read checkpoint change becomes `checkpoint_hash_mismatch`. An A→B→A flap now passes, but the snapshot still matches the final read, and `openapi.yaml:312` already disclaims atomicity.

**Is repeated identity only a better error?**
For API reads, mostly yes: a frozen checkpoint on a replaced chain still returns 503, with a different reason. For the indexer, no (inferred from source, not executed):
1. Ponder's finalized floor is block 0 while no block is older than the window (`finality.ts:72-75`), and idle Anvil never moves it (`sync-realtime/index.ts:1139-1143`).
2. Compose pins genesis (`compose.yaml:24-26`), and a reset plus redeploy gives the same address with a new hash (`integration.ts:662-665`).
3. With the app live, Ponder's parent walk reaches the shared genesis and accepts an ordinary reorg (`sync-realtime/index.ts:891-894`).
4. Without identity, rows roll back and `Progress` rewrites the checkpoint under the same scope (`src/index.ts:73-78`). Hashes then match, so the API returns 200 for the wrong deployment.

No test would catch this, because both resets happen with the app stopped (`integration.ts:630,662`, `compose-acceptance.ts:359,366`).

Other limits:
- `eth_getCode` is the one identity field hashes don't imply. That's acceptable here: `contracts/src` has no selfdestruct or delegatecall, and the repo never calls `anvil_setCode`.
- A fork sharing history through the head passes identity and hashes alike.
- An RPC that stops serving genesis or receipts no longer causes a 503.

**Sufficient only if** the RPC reports hashes honestly, code is immutable, checkpoints are written under a matching scope at or above the deployment block (`ponder.config.ts:25,29`, `config.ts:110-112`), and the indexer cannot ingest a replacement chain.

**Startup:** only the launcher verifies, once, before spawning both children (`scripts/indexer.ts:13`). `read-api.ts:8-11` checks just the floor, and tests start it standalone (`api-acceptance.ts:166-169`), so it would end up with no identity check. Adding one makes a standalone API refuse to start when RPC is down, instead of serving 503s.

**Must stay dynamic:** latest-head validation; scope, floor and unclamped eligibility from the snapshot; both post-snapshot hashes; `eth_blockNumber` in every `delayedRequest`; Ponder reorg handling; `engineState`.

**Minimal change**
1. `assertChainUnchanged`: use one `Promise.all` for checkpoint and head. A checkpoint mismatch gives `checkpoint_hash_mismatch`; a head-only mismatch gives `chain_changed_during_read`.
2. Drop `verifyDeployment`. `readValidHead` sets `trace.rpc='up'`, and the `identityValidated` gate (`health.ts:82`) goes; `api-acceptance.ts:230-236` pins both.
3. `delayedRequest`: remove line 69. On the latest/safe/finalized path, run `identity()` when the fetched block's hash differs from the last verified one. That is one closure variable and caches no readiness.
4. `read-api.ts`: add startup identity after the floor check, so the missing-floor error stays first (`api-acceptance.ts:245-252`).
5. Update `openapi.yaml:163,169-171`, `docs/development.md:52` and `docs/sdd/escrow.md:14` (preserve its uncommitted edits). `deployment_identity_mismatch` becomes unreachable from the API.

| Path (estimates) | Before | After |
|---|---|---|
| Idle Ponder tick | 7 | 2 |
| New eligible block, one log fetch | ~15 | ~10 |
| `/health` or `/escrows` | 14 | 3 |
| Idle total, app only | 14/s | 3.5/s |
| Idle total with Anvil check (if `cast chain-id` is one call) | ~14.5/s | ~4/s |

**Regression checks**
- Live reset plus same-address redeploy: checkpoint and rows unchanged, API 503. This must fail on naive removal.
- Method-recording proxy (extend `integration.ts:122`): a read is latest plus two numbered reads after SQL; an idle tick is 2; a new hash adds 5.
- Correct reasons for checkpoint mismatch, head-only mismatch and null block.
- Consecutive `/health` calls each issue fresh RPCs; RPC loss after a 200 returns 503.
- Standalone API refuses a wrong descriptor.

Claude usage remaining:
- Current session: 82% remaining · resets Nov 9 at 9:50pm (America/Buenos_Aires)
- Current week (all models): 91% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
- Current week (Fable): 100% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
