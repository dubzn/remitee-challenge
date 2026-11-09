**Verdict: I found no required code fixes and no behavior drift, but the old/new comparison you asked for is not done.** These tools can't read git objects, and the repo has no plain-text HEAD copy outside the excluded archive. I checked the current code against your invariants and against files the session-start git status shows as unmodified: `api-acceptance.ts`, `integration.ts`, `compose-acceptance.ts`, OpenAPI and the contracts. "No drift" therefore means none visible against those baselines. I ran nothing.

`read-model.ts` changed during the review (comment at :15-16, `Pick` cast at :65). Neither affects runtime, and the line numbers below are current.

**Checked in current code**

| Area | Evidence |
|---|---|
| Error precedence | Parse before I/O (`server.ts:55`, `openapi.yaml:624`); read failure before engine (`server.ts:75-77`); `health.ts:112` keeps the earlier reason |
| Trace | `scopeMatched` set before the floor check (`read-model.ts:151-154`), as `api-acceptance.ts:136-138` needs; RPC reset at `health.ts:104-108`; recheck leaves the trace alone |
| Transaction | BEGIN/COMMIT inside the try, ROLLBACK failure swallowed, release in finally (`read-model.ts:128-146`); guards run after release |
| Unclamped guard | `read-model.ts:157-158`. The clamp at `health.ts:77` is not drift: it is the spec formula (`openapi.yaml:313-314`), and negative results still become null |
| Recheck order | Hash, identity, then parallel re-read (`read-model.ts:164-174`) |
| Parser | Query before ID (`domain.ts:60-67`); limit, offset, then filters (`domain.ts:75-89`) |
| SQL | Expiry boundary agrees with `eligibility` (`queries.ts:21-24`, `domain.ts:128`); limit+1 and `hasMore` (`queries.ts:30`, `:67`) |
| Startup/shutdown | Floor is max(previous, eligible, 0) (`indexer.ts:24-26`); sibling stop is what `integration.ts:331-337` expects |
| Demo | Callers, recipients and statuses 1-4 match `Escrow.sol:69-102` and `IEscrow.sol:11-22`; preflight precedes the first write (`demo.ts:242-245`), as `compose-acceptance.ts:101-104` requires |

**Required fixes: none.**

**Still open before claiming equivalence (needs a HEAD diff)**

No baseline pins these:
1. **`demo.ts` assertions:** the harness only pins the stdout fields used at `compose-acceptance.ts:85-100`. Dropped payout, getter or trace assertions (present now at :156-158, :185-187, :202-207, :221-227) would only show in a diff. The same applies to any stdout key outside those fields.
2. **Recheck reasons:** no test references `checkpoint_hash_mismatch` or `chain_changed_during_read`. The reorg case at `integration.ts:449-467` checks served hashes and statuses, not reason codes.
3. **Missing-table and identity classification:** no test references the 42P01 branch (`read-model.ts:139`). Also compare the `verifyDeployment` RPC classification (:91-92).

**Recommended, optional tests**

Your `observationFixture` could cheaply cover hash mismatch, changed-during-read and 42P01, which would pin items 2 and 3.

**Optional readability**

- **Name:** `assertEligibleCheckpoint` (`read-model.ts:149`) also enforces scope and the startup floor and writes the trace. `validateCheckpoint` fits better and matches the SDD wording.
- **Comment at `server.ts:75-77`:** read-before-engine is the least obvious precedence and has no explanation.
- **Comment at `health.ts:77`:** cite the spec, because `read-model.ts:156` says "keep unclamped" and someone may "align" the two.
- **Dead parameter:** no caller passes `trace?` to `readEscrows` (`queries.ts:73`).
- **Re-exports at `server.ts:12-14`:** `businessPaths` has no importer through `server.ts` (`api-spec.ts:8` uses `domain.ts`), and the other two only serve `api-unit.test.ts:8`. Pointing the test at the real modules leaves `server.ts` as dispatch only. These may predate this refactor.
- **Magic value:** name `'42P01'` once (`read-model.ts:139`, `health.ts:34`).
- **Shadowing:** `result` (`queries.ts:74`, `:76`) and `child` (`indexer.ts:65`, `:73`).
- **Repeated work:** `assertChainUnchanged` recomputes `indexed`, which `queryObservation` already has (`read-model.ts:163`, `:210`).

**Proportionality: good.** `queryObservation` reads as five named stages that match the SDD order. `errors.ts` is small and justified, since both `server.ts` and `health.ts` need it. Leaving `rpc.ts` alone is right. I would not add any helper; the suggestions above only rename, remove or annotate, apart from naming one constant.

Claude usage remaining:
- Current session: 72% remaining · resets Nov 9 at 4:50pm (America/Buenos_Aires)
- Current week (all models): 94% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
- Current week (Fable): 100% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
