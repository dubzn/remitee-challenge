# S3 implementation review before commit

Review the current uncommitted S3 read API implementation, in English, as a bounded read-only consultant. Do not edit files, run commands, request approval, delegate or browse. Return READY, READY_WITH_FIXES or BLOCKED; actionable findings with severity and precise file/function evidence; minimal corrections and regression checks. Separate actual defects from optional hardening and acknowledge unverified claims. No tests or audit were performed by you.

The candidate explicitly requested Claude review followed by commits only if verification passes. Use the established Opus model and xhigh effort. A one-week challenge already has 62 contract tests and a Ponder 0.18.5/PostgreSQL indexer. This task implements AC9/AC10 and #11 raw spec/response checking. The November 6 OpenAPI and prior disposition are the accepted contract, not a request to reopen core architecture. No transaction API, signer, wallet UI, cache, AuthN/AuthZ, pause/upgrades or production deployment. Swagger UI remains optional and is not implemented.

Relevant files only:

- `.docs/api/openapi.yaml`, `.docs/api/README.md`, `.docs/outputs/codex/2026-11-06-read-api-spec.md` for exact routes/shapes/guard decisions; three GET business routes, lossless decimal strings, strict validation and canonical observation.
- `apps/indexer/api/domain.ts`, `queries.ts`, `server.ts` for parsing, bounded parameterized SQL, serialization, health and static specification.
- `apps/indexer/read-model.ts`, `config.ts`, `rpc.ts` for the shared snapshot/canonical guard and policy.
- `scripts/indexer.ts`, `scripts/read-api.ts` for shared startup floor, child lifecycle and loopback binding.
- `scripts/api-spec.ts`, `package.json`, `.github/workflows/foundation.yml` for pinned offline validation and CI wiring.
- `apps/indexer/test/api-unit.test.ts`, `api-acceptance.ts`, relevant additions to `integration.ts` for meaningful coverage.

Verification evidence supplied by Codex, not your execution: root/application typechecks pass after a test-only Response annotation; six API tests including OpenAPI 3.1 structure, 14 response-example uses, bounds and strict input cases pass. The actual Anvil/PostgreSQL/Ponder integration is running: public status/AND-filter/pagination/trace/large-amount/404 checks, real repeatable-read writer progress, API-only unreachable-DB and startup-floor cases, static docs, sibling termination/restart, six exact chain-time boundaries, restart/crash, writer exclusion, RPC outage and within-window rollback have passed. Beyond-window/replay checks are still running. Do not call the full suite green from this partial evidence.

Check especially:

1. Filter semantics and SQL binding: effective status before newest-first limit/offset, limit+1 hasMore, no unbounded public scans or filter interpolation, address normalization and uint256 IDs.
2. Same SQL snapshot for rows/checkpoint and one captured chain timestamp; scope/floor/eligibility/canonical checks must gate 200 and 404. Preserve the documented residual RPC/SQL race rather than claiming finality. Are readiness rechecks or failure ordering contradictory?
3. Health503 shape, independent component probes, null unavailable diagnostics, comparable nonnegative lag/backlog, all declared responses/no-store, safe errors and validation before readiness. Does an exception leak data, yield the wrong schema or kill the app?
4. State/trace/time representation: exact uint256/uint64 bounds, terminal immutability, recorded Pending vs derived ExpiredRecoverable, hash nullability and no implied payout guarantee.
5. Shared launcher context and shutdown: both children receive the same validated descriptor/schema/policy/startup floor; consumer refuses a missing floor. Errors/ports/exit/signal handling must not leave a live sibling or publish during restart rollback. API_PORT is operational and intentionally outside the data scope key.
6. Static canonical OpenAPI stays available independently of data readiness while the API process runs. Validate the single artifact and real HTTP responses in Node CI; no second schema source. Tooling uses pinned @redocly/openapi-core, Ajv2020 and yaml as dev dependencies only.
7. Test gaps that could conceal a real AC9/AC10 defect. Fixtures share the existing isolated application acceptance resources; they deliberately use no production fault flags. Distinguish actual HTTP/DB evidence from schema/pure-unit checks.

Do not infer irrecoverability from elapsed wall-clock wait: the pinned Ponder rollback window is based on block timestamps. Do not broaden into production asset controls, stale-success fallback or API authentication. End with any remaining blocking fixes required before a local commit; remote CI cannot be observed until code is pushed, and the current instruction authorizes commits, not a new push.
