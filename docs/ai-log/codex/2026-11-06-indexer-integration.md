# Ponder application integration

Date: November 6, 2026. The candidate authorized updating #4 without deleting decision history and integrating the selected Ponder engine. This output records Codex implementation and actual local verification. No additional Claude run or public-chain broadcast was performed.

## Implemented boundary

- New npm workspace apps/indexer with Ponder 0.18.5, viem 2.57.16, Hono 4.13.16 and the existing pg version locked in the root lockfile. The earlier PoC remains independent.
- Reproducible local deployment and a deployment-descriptor capture command. Compiled runtime code and five event signatures are checked. Local deploy refuses non-loopback/non-Anvil targets and reuses a valid descriptor without another transaction.
- Runtime validates chain/genesis, deployment receipt/block/address/code and persisted scope/policy. Ponder owns one writer, internal progress and rollback. No application writes to framework metadata or second pg writer.
- Pure projection rules plus a Ponder persistence adapter. Journal retains raw/decoded event identity, actor and transaction/log positions; projection retains successful creation/resolution hashes and block references. Repeated creation cannot reset terminal state; conflicts and illegal actors/transitions fail.
- Two-additional-block admission, including safe/finalized tags and range/hash log queries, with an explicit positive 180-second recovery window. Public block callback advances an app checkpoint through empty blocks.
- A read-only query pool obtains rows/checkpoint in a repeatable-read snapshot, verifies current identity/canonical hashes and reports observation/lag/backlog. Startup publication waits for a floor at least as high as persisted progress and the eligible head captured before engine launch. This avoids publishing temporary restart rollback.
- Internal /observed/health and /observed/escrows for S2 operation. Native Ponder health stays internal; required public S3 routes, filters and time-derived eligibility remain next.
- GitHub #4 retains its entire earlier body and appends the Ponder decision/acceptance update. The current task is not a rewrite of the polling history.

## Executed verification

[Raw application observations](2026-11-06-indexer-integration-results.json). Successful run: remitee-indexer-check-92166-4d124279, exit 0. It executed the actual application launcher and handlers against isolated pinned Anvil/PostgreSQL, then removed its containers/network/volume. No development service was reset.

| Check | Actual result |
| --- | --- |
| Clean dependency install | Root npm ci succeeds with workspace lock. Root/app typechecks pass; app uses public Ponder codegen for ignored ambient types. |
| Projection/configuration rules | 16 tests pass: identical/conflicting replay, terminal immutability, actor/order validation, all outcomes, trace fields, configuration and read-only RPC method boundary. |
| Local deployment CLI | A distinct deployment is created; repeating the command validates/reuses it without changing sender nonce. |
| Historical reconstruction | 5 escrows, 9 events, all four outcomes plus Pending. uint256 maximum 115792089237316195423570985008687907853269984665640564039457584007913129639935 round-trips exactly. Successful transaction hashes match receipts. |
| Admission/empty blocks | Visibility false/false/true/true at 0/1/2/3 extra blocks. Empty blocks advance checkpoint without extra events. |
| Offline catch-up | Graceful restart catches up to 7 escrows/11 events. |
| Physical persistence interruption | Test-owned PostgreSQL trigger blocks a journal INSERT inside the transaction. Kill leaves 0 event/0 escrow rows for the interrupted creation and checkpoint 27 before event block 28. Restart recovers 8 escrows/12 events; another restart retains exactly 12. No production fault hook. |
| Concurrent writer | A second same-scope Ponder instance is excluded; journal stays at 12. |
| RPC outage | Data and application health return 503, then recover. |
| Recoverable admitted fork | 80 sampled reads over 10 seconds with window 180: successful responses match their canonical checkpoint; final Rejected and orphan journal entry removed. |
| Beyond-window replacement | After a verified 181-second timestamp advance, 112 rounds for 60 seconds keep data/health at 503. Restart exits 1 without exposing the orphan. |
| Explicit replay | New validated schema reaches 8 escrows/14 events with canonical Rejected and no orphan release. |
| Refusal paths | Existing replay scope, changed admission/scope, wrong code identity and same-address chain reset are rejected; stored journal remains intact. Malformed duplicate log positions are rejected by the engine. |
| Existing foundation | npm run check passes, including real Anvil/PostgreSQL rollback/lock/mining checks and stopped-DB refusal; test resources cleaned. |
| Workflow | New indexer job uses pinned checkout/setup-node and runs type/rule/actual-service acceptance. YAML and shell parsing are checked. Remote execution is pending publication at this record. |

## Corrections found during integration

The ESM-only Ponder package required ESM resolution in the launcher. Hash-filtered getLogs must not receive toBlock/fromBlock additions; the adapter now validates that block hash independently. Initial duplicated-RPC-log injection revealed safe rejection of malformed batches, so this is a refusal case rather than a valid repeated-delivery fixture. Restart initially exposed an older canonical prefix before all unfinalized history replayed; the startup publication floor fixes that and the previously failing restart assertion passes.

One initial foundation build timed out while resolving Docker image metadata with the host's normal registry credential helper. The same check passed using a temporary anonymous Docker client configuration against the existing daemon. No user credential configuration was changed. The final foundation image installs only root production dependencies with workspaces disabled, avoiding an unnecessary indexer dependency inside the smoke-tools image.

## Remaining gates

Local I1-I4 are verified. I5/AC6-AC8 final closeout still requires observed remote CI for the published code. S3 read API, S4 full startup/demo and S5 final rehearsal remain separate. [Runtime commands](../../indexer-runtime.md) and [CLI wallet/testnet runbook](../../testnet-wallet.md) are available. Testnet instructions are manual and unexecuted; expiry requires seven real days there and is tested deterministically on Anvil instead. No wallet UI, signer key in the observer, broker or competing polling worker is added.

## Relative descriptor regression

Additional run remitee-indexer-check-95996-9beee0ca: [13 successful observations](2026-11-06-relative-descriptor-results.json), exit 0. The launcher resolves a relative DEPLOYMENT_FILE before changing cwd for Ponder; the fixture now uses a relative path. The competing writer uses a distinct port and explicitly asserts the schema-lock message. Recoverable fork: 78 samples; deep replacement: 112 rounds over 60 seconds. Development services were preserved and isolated resources cleaned.

## Observed CI closeout

The [run 42248952896](https://github.com/dubzn/remitee-challenge/actions/runs/42248952896) completed successfully for 64030571741ce8660636ce906b84af311cf8cf47. All three jobs passed: foundation, contracts (62 tests/ABI) and actual indexer acceptance. S2/AC6-AC8 and I5 are complete; #4 is closed with history retained. This supersedes the pending gates recorded during the earlier implementation stage. S3/API, S4/demo and S5/rehearsal remain pending. The subsequent documentation closeout does not change the verified code.
