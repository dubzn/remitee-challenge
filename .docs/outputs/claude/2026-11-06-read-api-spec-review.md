## Verdict: READY_WITH_FIXES

The draft's scope is small enough and its semantics hold up. None of the findings require new contract behavior, a cache, authentication or an engine change. Three things should be settled before handlers are written: what `/health` returns in its 503 body (finding F1), what each `components` value means (F2), and how the separate API process gets its startup floor (F3). Everything else is a wording change or a default to pin down. I only read files; nothing here comes from running anything.

## Findings

| # | Severity / type | Evidence | Smallest fix |
|---|---|---|---|
| F1 | **Medium / requirement conflict (AC10)** | AC10 (`sdd/escrow.md:63`) asks health to show the confirmation delay, head lag and eligible backlog, and to tell expected lag apart from unprocessed work, including during catch-up. The 503 `diagnostics` object (`openapi.yaml:554-572`) has only `observedHead` and `indexedThrough`. During `startup_catchup` a client cannot compute the backlog without knowing the delay. | Add a required `confirmationDelay` to `diagnostics` (it is static config and always known). Add `headLag` and `eligibleBacklog` as nullable fields, computed only when both blocks are present and labeled unverified. |
| F2 | **Medium / proposed default missing** | `components.indexer` (`ready\|catching_up\|unavailable\|unknown`, `:543-549`) is not defined. Ponder's `/ready` stays 200 during an RPC outage and after an unrecoverable reorg (`outputs/codex/2026-11-06-ponder-poc.md:26,30`). So `ready:false` alongside `rpc/database: up, indexer: ready` will happen and looks contradictory. | Add one sentence: components report reachability and engine status, and `reason` names the first verification that failed. Map each reason to a component state. For example, `startup_catchup` → `catching_up` (even when Ponder `/ready` returns 200), and `indexer_not_ready` → `catching_up`. For mismatch or `checkpoint_not_eligible`, all components can be up while `ready` is false. |
| F3 | **Medium / hosting constraint** | The launcher computes the startup floor (`scripts/indexer.ts:21`) and passes it only to the Ponder child (`:40`). In a separately started process, `settings()` defaults it to 0 (`config.ts:80`), which silently turns off the `startup_catchup` gate in `read-model.ts:57`. The API also needs the same delay, reorg window and schema, or the `scopeKey` check fails (`config.ts:88-90`). | Not an OpenAPI change, but decide it before handlers. Have the launcher start the :3000 listener with the same environment: floor, delay, window, schema, and `INDEXER_PORT` for the `/ready` probe. |
| F4 | Low / proposed default | `limit`/`offset` are `type: integer`, and the prose says "unsigned base-10" (`:87`). Leading zeros, `+` and whitespace are left undefined, and generic validators may coerce values. | State that the raw string must match `^(0\|[1-9][0-9]*)$` before the range check. |
| F5 | Low / example implies state | The `RpcUnavailable` example (`:792-810`) shows a non-null `observedHead` while RPC is down. That only works if the process remembers the last head in memory. | Change that example to `observedHead: null`, with `indexedThrough` read fresh from the DB and marked unverified. This keeps the handler stateless. |
| F6 | Low / doc conflict | The SDD says the head time is "cached by the indexer" (`sdd/escrow.md:93`, diagram `:112`) and refers to a "failed RPC poll" (`:165`). The OpenAPI and `readObservation` capture the head once per request (`read-model.ts:35`). | Reword those SDD proposal rows to "captured per response by the read API". |
| F7 | Low / naming | The reason value `observation_unavailable` (`:425`) duplicates `error.code` (`:480`). The facade maps every unclassified error to that value (`src/api/index.ts:22`). | Document it as the catch-all for unclassified failures. Fix the precedence to the `readObservation` check order: identity → head → snapshot → scope → floor → eligibility → hash → recheck. |
| F8 | Low / semantics | `canCancel`/`canRecover` (`:343-350`) do not mention that a resolution may already sit in blocks still inside the confirmation delay (not yet indexed). | Add: "…nor that no unadmitted resolution exists." |
| F9 | Low / semantics | `checkpoint_hash_mismatch` covers two cases: a reorg Ponder will roll back on its own (within the reorg window) and one that needs explicit replay (`indexer-runtime.md:70-76`). | Add operator guidance: if the mismatch persists past `reorgWindowSeconds`, explicit replay is required. No new state is needed. |
| F10 | Low / edge | `hasMore` can be true when the next offset would exceed 10000. | Document that pages beyond the maximum offset are not reachable. |
| F11 | Low / proposed default | Unknown routes, trailing slashes, non-GET methods, malformed percent-encoding and 500 errors are not covered. | Say the contract covers only the three exact paths. Keep unclassified exceptions as 503 `observation_unavailable` (the current facade behavior), and treat bad percent-encoding as 400. |
| F12 | Info / implementation | `readObservation` returns `chainId` as a JS number (`read-model.ts:70`). It also selects every row without filters (`:47`), and the raw rows use snake_case columns with a `status` field (`test/integration.ts:308-309`). Success responses already never need `max(0,…)`, because `read-model.ts:59-60` returns 503 in that case. | The S3 adapter should reuse the guard sequence with parameterized SQL, stringify `chainId`, map the columns, and lowercase hashes defensively. |

## Your seven questions

1. **Route boundary:** Clear and small. There are exactly three GET routes, `security: []`, and a separate listener (`:10-13`, `:162-163`). One decision is still open: there is no standalone HTTP server dependency yet (only `hono`, `pg`, `ponder`, `viem` in `apps/indexer/package.json`), while the SDD stack row still says Fastify (`sdd/escrow.md:88`).
2. **Lossless numbers:** Sufficient. The 78/20-digit limits plus an exact BigInt bound check are correct. `id=0` returning 400 is a reasonable choice. Only F4 is missing.
3. **Filters and pagination:** Consistent with the SDD (`:95-96`, `:155`). Capture the head timestamp before the SQL query, since the `Pending`/`ExpiredRecoverable` predicates depend on it.
4. **Derived status and eligibility:** Matches the contract. Cancel reverts when `block.timestamp >= cancelDeadline` and recover reverts when `block.timestamp < expiresAt` (`Escrow.sol:63,87`). The boundary values in the examples check out: 1000+7200=8200, 1000+604800=605800, and head=605800 → `ExpiredRecoverable`.
5. **Snapshot and 404:** Matches `read-model.ts:32-84`. A 404 that carries the observation is correct. The residual RPC/SQL race is documented (`:300-301`).
6. **Health:** Honest without a durable observer, provided F1, F2 and F5 are applied. The only contradiction is the undefined component meaning (F2).
7. **Nullability and invariants:** `oneOf [Hash, null]` is fine. Keep cross-field rules in runtime tests rather than a second schema source. A JSON Schema `if/then` on `onChainStatus` is an optional extra.

## Runtime tests vs JSON Schema

**Keep in JSON Schema:**
- types, patterns and enums
- `additionalProperties: false`
- `ready` const and the `null` observation on 503
- `maxItems`

**Test at runtime:**
- exact uint256/uint64 bounds
- derived fields at deadline −1, exact and +1, for both deadlines
- `resolutionTxHash` is null if and only if the record is `Pending`
- `indexed + delay ≤ head`, and that `headLag` and `eligibleBacklog` add up
- ID-descending order, every item matching its filters, `items.length ≤ limit`, correct `hasMore`
- 400 is returned before readiness is checked
- `no-store` on every declared status
- a 404 still carries its observation

## S3 checklist

1. Apply F1, F2, F4, F5 and F7–F11 to the OpenAPI. Apply F6 to the SDD.
2. Settle F3 and the server framework choice.
3. Build a pure validator: strict query and path parsing that rejects repeated or unknown parameters, and an exact BigInt bound check.
4. Build a pure derivation function for `effectiveStatus`, `canCancel` and `canRecover`, with boundary tests.
5. Write a query adapter that runs the existing guard order with AND filters and `ORDER BY id DESC LIMIT n+1 OFFSET m` inside one REPEATABLE READ READ ONLY transaction.
6. Map the response: stringify integers, rename snake_case columns to the API names, lowercase hashes and addresses.
7. Map each error and failure to a reason, and each component to its probe result.
8. Write PostgreSQL/HTTP tests for:
   - each filter alone and combined
   - `status=ExpiredRecoverable` without a recovery transaction
   - pagination and `hasMore`
   - 404
   - 400 cases
   - 503 for RPC loss, catch-up and mismatch
   - health 200 with the expected two-block lag
9. Validate every example against its schema (Codex owns this).

## Decisions still open

- How the listener is launched and how it inherits its environment (F3).
- HTTP server: plain `node:http` with no new dependency, or adding `@hono/node-server` or Fastify.
- Whether to accept that `ready=true` has no backlog threshold. This is consistent with the employer's "network delay is acceptable" and no SLA, but it should be stated explicitly.

Two notes on what I didn't verify. I did not check Ponder's own `reorgWindow` units, which affects F9. And I could not write the plan file or exit plan mode, because only read and search tools were available.

Claude usage remaining:
- Current session: 93% remaining · resets Nov 7 at 1:29am (America/Buenos_Aires)
- Current week (all models): 92% remaining · resets Nov 8 at 11:59am (America/Buenos_Aires)
