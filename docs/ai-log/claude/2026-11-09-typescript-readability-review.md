**Verdict:** the logic is sound, but long functions hide their phases. Extract named steps inside the existing files; no new layer is needed.

## Problems and extractions, by payoff
If time is short, do the first three rows. All helpers stay unexported.

| Target | Evidence | Extract |
|---|---|---|
| `queryObservation`, `read-model.ts:61-133` | Six phases in one body; `trace` is a mutated out-param that `health` later interprets | `verifyDeployment`, `readValidHead`, `readSnapshot`, `assertAdmissible`, `assertChainUnchanged`, `buildObservation`; document when each `ReadTrace` field is set |
| `health`, `server.ts:51-87` | Read, RPC-fact reset, DB fallback, engine probe and component derivation through reassigned `let`s | `probeDatabaseIfUnreached`, `indexerComponent`; handler error branch becomes `writeFailure` |
| `demo.ts:17-146` | One `try`; index-aligned `deposits`/`resolutionTxs`/`states`; `i + 1` as status (`:132`); boolean tuple (`:79`); helpers interrupt preflight (`:41-63`) | Outcome table; `preflight`, `balances`, `writeEscrow`/`writeToken`, `readEscrow`, `assertBalanceChange`; one function per phase |
| `delayedRequest`, `rpc.ts:60-98` | Per-method policy with implicit fall-through (`:94`); tag list duplicated (`:72,87`) | `eligibleHead`, `delayedBlockByNumber`, `delayedLogs`, `isMovingTag`; rename `d` |
| `readEscrows`, `queries.ts:8-46` | SQL assembly inside the callback; repeated `kind` ternaries; `now` is chain time | `escrowSelect` returning `{text, values}`, `detailResponse`, `pageResponse`; rename `now` to `headTime`; drop unused `trace?` |
| `scripts/indexer.ts:9-81` | Preflight, env, supervision and spawn in one `try`; `child` vs `api`; liveness check ×3 | `resolveStartupFloor`, `childEnvironment`, `isRunning`, `spawnIndexer`, `spawnReadApi` |
| `parseRequest`, `domain.ts:58-98` | Routing mixed with list validation | `parseDetail`, `parseListQuery` |

## Skip: abstraction for its own sake
- A shared eligibility helper (trap 1)
- Merging `inputInteger` and `decimal`, which have different failure types
- Replacing `trace` with result unions
- Splitting `identity()` or `publicEscrow`
- Renaming `queryObservation`, which tests import
- Any shared `scripts/` module (trap 10)

## Behavior traps
1. **Eligibility isn't uniform.** `read-model.ts:112` is unclamped; `server.ts:41`, `rpc.ts:69` and `indexer.ts:22` clamp at zero. Clamping the first admits indexed block 0 when head < delay.
2. **Trace writes.** The second `chain.identity()` (`read-model.ts:116`) leaves `trace` alone, so it can't reuse `verifyDeployment`. A failed `latest` fetch (`:76`) leaves `trace.rpc` as `'up'` until `server.ts:59-61` resets it.
3. **Transaction.** Keep `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` verbatim; Ponder stays the only writer (`README.md:67`). The callback stays inside the `try`, so plain errors become `database_unavailable`. Release precedes the RPC rechecks. Order is scope, startup, eligibility, canonical hash, identity, parallel recheck. Hash comparisons stay case-sensitive.
4. **HTTP precedence.** 405 comes before parsing. Data routes read first, then probe the engine, so engine failure beats a 404. Health's observation reason beats the engine's. Serialization errors give 503.
5. **Parsing order.** Query string before id; `not_found` skips query validation; then limit, offset, sender, beneficiary, status.
6. **SQL.** Placeholders run filters, limit, offset. Keep `limit + 1` and `>`/`<=`.
7. **RPC.** The allowlist stays outside `try` (`unit.test.ts:179`). Identity runs on every delayed request. `from > eligible` returns `[]` without a call. Unhandled block tags still throw from `BigInt`.
8. **Launcher.** `pool.end()` precedes the head read. `supervise` immediately follows each spawn. Any unexpected child exit yields code 1 (`integration.ts:331-333`). SIGTERM escalates to SIGKILL at 8s. Children share one env with an absolute `DEPLOYMENT_FILE`. Keep the `APPLICATION_CHILDREN` line.
9. **Demo.** Both `/health` checks precede the first write (`compose-acceptance.ts:101-104` compares nonces). Writes stay sequential, the timestamp is exactly `expiresAt`, and mining counts stay fixed (`headLag` assertion). Stdout fields are consumed.
10. **Packaging.** New `scripts/*.ts` aren't copied by `Dockerfile.app:17`, and adding them breaks the exact list at `compose-acceptance.ts:74`. A new `apps/indexer/<subdir>/` is excluded by `.dockerignore`.

## Facts and assumptions
- **Fact:** no test references `delayedRequest` or `block_not_eligible`. `health` has no unit test; integration reaches `/health`. Add characterization tests for both before extracting them.
- **Unverified:** whether integration covers health's reason precedence.
- **Assumption:** Ponder exercises `delayedRequest` indirectly; I did not trace it.
- I ran no tests and changed no files.

Claude usage remaining:
- Current session: 87% remaining · resets Nov 9 at 4:49pm (America/Buenos_Aires)
- Current week (all models): 95% remaining · resets Nov 15 at 11:59am (America/Buenos_Aires)
