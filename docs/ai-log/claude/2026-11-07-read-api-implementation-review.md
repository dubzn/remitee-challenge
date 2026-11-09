**Verdict: READY_WITH_FIXES.** Nothing in the code blocks a local commit; what blocks it is the integration suite that is still running.

This was a static read only. I ran no commands or tests and couldn't view `git diff`, so what's new versus pre-existing is my inference from git status and file contents. I wrote no files.

## Defects (none blocking)

**D1 — Low: `components.indexer` can report `ready` without checking the startup floor.**
- **Evidence:** at `apps/indexer/api/server.ts:73` the state comes from the engine alone unless the reason is `startup_catchup`. The contract says `ready` needs native readiness *and* the floor met, and `unknown` means not checked (`.docs/api/openapi.yaml:568-573`).
- **When it happens:** if a guard fails before the floor check (DB down, `checkpoint_unavailable`, RPC down), the API reports `ready` from Ponder's `/ready` alone. Overall `ready=false` is still correct, so only diagnostics are affected.
- **Fix:** derive `floorMet` from `trace.checkpoint` when `scopeMatched` is set. If false, report `catching_up`; if it can't be checked, report `unknown`. Keep the existing `startup_catchup` override.
- **Check:** the DB-down standalone case gives `unknown`. The startup-floor and RPC-down cases still pass, and a healthy response is still `ready`.

**D2 — Low: a malformed RPC block header is reported as a database failure.**
- **Evidence:** `apps/indexer/read-model.ts:90` evaluates `BigInt(head.timestamp)` inside the SQL `try`. A `TypeError` there falls through to `:96-97`, which sets `database='down'` and returns `database_unavailable`.
- **Fix:** validate the head's number, hash and timestamp right after `:77`, throwing `rpc_unavailable` before `pool.connect()`. Then pass one parsed `headTime` to both the query and `:119`.
- **Check:** a fake RPC returning a header without `timestamp` gives `rpc_unavailable`.

**D3 — Medium (docs only, no contract change): the committed prose contradicts the code.**
- `openapi.yaml:5-7,15-16` says handlers are "not yet implemented", and that file is what `/openapi.yaml` serves.
- `.docs/api/README.md:3,63,69,79-87` says no handler exists, the lifecycle is only planned, the commands aren't runnable, and validation uses Python with "no CI job added".
- `.docs/sdd/escrow.md:167` still says "planned".
- **Fix:** change descriptions only, and keep AC9/AC10 marked as pending full acceptance. Re-run `api:spec` and `api:unit`; the HTTP suite only checks the `openapi: 3.1.0` prefix.

## Test gaps that could hide a real AC9/AC10 defect

- **T1 — Medium:** the public API is sampled only once during the within-window rollback, after the 10 s loop (`apps/indexer/test/integration.ts:467-471`, indented outside the `while` at `:451-466`). So the public path is barely watched while the checkpoint is noncanonical.
  - Move that read into the loop.
  - For each 200, assert `indexedThrough.hash` matches the chain's block at that height and `onChainStatus` matches that point.
- **T2 — Medium:** the engine-readiness gate (`server.ts:104-106`) is never tested on its own; earlier guards explain every 503 in the suite. Add a standalone case with `INDEXER_PORT` set to a free port:
  - `/escrows/1` and `/escrows/999` should return 503 `indexer_unavailable`, never 200 or 404.
  - `/health` should show rpc and database `up`, indexer `unavailable`, and non-null lag and backlog.
- **T3 — Medium:** AC10 says expected lag must be distinguishable from unprocessed work, but nothing asserts it. At idle steady state (wait with `until`), assert `headLag === '2'` and `eligibleBacklog === '0'` (`apps/indexer/test/api-acceptance.ts:74-77`).
- **T4 — Low-Medium:** the status-filter SQL (`apps/indexer/api/queries.ts:17-19`) is never tested at the expiry boundary.
  - In `exerciseTimeBoundaries`, also query `?status=Pending` and `?status=ExpiredRecoverable` at each of the six times.
  - Assert id 6 appears in exactly the expected list and `observedHead.timestamp === now`.
- **T5 — Low:**
  - The missing-floor test checks only a nonzero exit (`api-acceptance.ts:141-145`); also assert the log message.
  - Add unit checks that `API_PORT` stays out of the scope key and that equal ports are refused (`unit.test.ts:163-171`).
  - Check that the status and reason lists in `domain.ts` and `server.ts` match the spec's enums.

## Optional hardening (not defects)

- **Launcher signals:**
  - `scripts/indexer.ts:80-81` uses `process.once`, so a second signal skips the SIGKILL escalation; `process.on` fixes that.
  - The outer `catch` (`:82-88`) should call `shutdown(1)` if a child was already spawned.
  - SIGKILL to the launcher alone still orphans both children. That can't be fixed without an IPC channel.
- **Scope drift:** each child re-reads `DEPLOYMENT_FILE` itself. Passing the launcher's scope key and refusing a mismatch would close that gap.
- **Status-filter cost:** there's no index on status (`ponder.schema.ts:28`). Output is bounded, but scan time is limited only by the 5 s statement timeout. Adding an index changes the Ponder build, so defer it.
- **Health wrapper:** if `health()` ever threw, `/health` would return the data-route error shape (`server.ts:109-111`). I found no path that triggers it.
- **Pool exhaustion:** with `max: 3` and a 2 s connect timeout, a busy pool is reported as the database being down.
- **Transient 503:** the head is captured before the SQL snapshot, so active mining can briefly cause `checkpoint_not_eligible`. It fails closed; worth a sentence in the docs.

## Your seven checks

1. **Filters and SQL:** pass.
   - Every filter value is a bound parameter (`queries.ts:12-27`). The only interpolated pieces are the validated schema name, the literal `'Pending'`, an operator from a fixed pair, and the detail route's literal `1`/`0`.
   - The status filter uses the same captured time as `eligibility()` (`domain.ts:113-119`), so the boundaries agree.
   - Newest-first order, fetching limit+1, `hasMore`, address lowercasing and the `$1::numeric` uint256 ID are all correct.
2. **Snapshot and guards:** pass.
   - Checkpoint and rows share one repeatable-read, read-only transaction (`read-model.ts:85-91`), and one head (`:76`) feeds the SQL time, the rows and the observation.
   - All guards plus the engine check run before 200 or 404 is decided, in the documented order. The recheck narrows the RPC/SQL race without claiming atomicity.
   - I found no contradiction. An identity or RPC failure during the recheck reports that reason rather than `chain_changed_during_read`, which matches first-in-order.
3. **Health and errors:** pass, apart from D1.
   - Components are probed independently, unavailable diagnostics are null, and lag and backlog need a valid identity and matching scope, are never negative and are never clamped.
   - `no-store` is on every JSON response, error messages are fixed (no request input is echoed), and no BigInt reaches JSON.
   - I found no path that kills the process.
4. **Representation:** pass. Exact uint256/uint64 bounds hold on input and output, terminal states stay terminal, `ExpiredRecoverable` is derived from recorded Pending, and the Pending ↔ null-resolution-hash invariant is enforced (`domain.ts:130`).
5. **Launcher:** pass.
   - Both children get the same environment, and the API refuses a missing or noncanonical floor.
   - The floor and engine gates stop publishing during restart rollback, and `API_PORT` is outside the scope key.
   - Ponder exiting → API stopping is only exercised indirectly (the malformed-provider launcher exit).
6. **Spec and tooling:** pass.
   - The spec is read once at startup and served regardless of data readiness.
   - The pinned Redocly `spec` ruleset really checks structure and unresolved references, so the lint isn't empty.
   - The 14 example uses add up (6 + 4 + 4), and CI runs `api:spec`, `api:unit` and real-response validation.
7. **Evidence types:**
   - Real HTTP and DB checks: filters and pagination, the snapshot during writer progress, DB down, startup floor, RPC down, the six time boundaries, and sibling restart.
   - Schema or pure-unit checks only: parsing, bounds, serialization and the spec examples.

## Not verified by me

- Every pass/fail result in your summary.
- `package-lock` integrity.
- Whether Redocly makes any network calls.
- CI duration against the 12-minute step limit.
- Ponder's `/ready` behaviour during restart, which I inferred from the design.
- The beyond-window and replay results, which are still running.

## Blocking fixes before a local commit

None in the code. The gate is the full `npm run indexer:test` finishing green. I'd include D3 in the same commit, since it's prose only and needs just `api:spec` and `api:unit`. D1, D2 and T1–T4 can follow in a separate commit with its own full run. Remote CI can't be observed until you push, and you've only authorized commits.

Claude usage remaining:
- Current session: 80% remaining · resets Nov 7 at 1:30am (America/Buenos_Aires)
- Current week (all models): 91% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
