# S3 read API implementation and verification

Date: November 7, 2026. Scope: implement the reviewed three-route read API and raw OpenAPI serving, with actual response/schema checks in the existing application CI job. No contract/token behavior, signing, wallet UI, cache, AuthN/AuthZ, Swagger UI or production deployment was added. Full setup/demo and NatSpec remain S4/#12.

Local implementation commit: `9ee0c36`. It has not been pushed; no new remote CI result is claimed. Lockfile compatibility also passed npm ci --dry-run --ignore-scripts --no-audit --no-fund before the commit.

## Implemented boundary

The native Node listener serves GET /escrows/{id}, /escrows and /health on loopback/API_PORT (default3000). GET /openapi.yaml returns the canonical checked-in file outside data readiness. Ponder keeps its internal listener and /observed diagnostics.

Pure parsing/eligibility/serialization lives in apps/indexer/api/domain.ts. Query code applies parameterized sender/beneficiary/effective-state AND filters before descending-ID LIMIT/OFFSET and fetches limit+1 for hasMore. It reuses queryObservation in read-model.ts: a read-only repeatable-read transaction pairs rows with checkpoint, followed by deployment/scope/startup/eligibility/canonical rechecks. The older internal readObservation remains a wrapper around that same guard.

The shared launcher computes one startup floor and passes resolved deployment/scope/policy to both children. The consumer refuses missing floor context. Unexpected child exit stops its sibling; restart recalculates context. API_PORT is operational and is excluded from the persisted data scope key. No automatic reset or replay was added.

Health reports current probe results, a verified observation only on 200, and partial nullable diagnostics on 503. Input failures are 400 before dependency checks. A 404 requires verified admitted absence. Data/health responses use no-store and sanitized errors. Time eligibility does not promise token transfer success or absence of an unadmitted resolution.

## Local execution evidence

| Check | Observed result |
| --- | --- |
| npm run check | Passed root TypeScript, isolated foundation smoke and stopped-database negative check. |
| npm run contracts:check | Passed 62 tests across 3 suites, format/build/ABI in pinned Foundry. No contract source changed. |
| npm run indexer:typecheck | Passed Ponder codegen and strict application types. |
| npm run indexer:unit | Passed 16 projection/configuration tests, including API port policy assertions. |
| npm run api:spec | Valid OpenAPI 3.1, three registered GET paths, 14 response-example uses and six rejected invalid fixtures. |
| npm run api:unit | Passed 7 tests covering parsing, exact integers, time boundaries, serialization, runtime/spec enum parity, dependency-free validation/static docs and malformed RPC headers. |
| npm run indexer:test | Passed 18 actual application observations after review fixes, including public HTTP/schema checks and prior S2 recovery cases. |

The initial application run used remitee-indexer-check-31209-d7a83102; the full post-review rerun used remitee-indexer-check-37154-929b4011. Reports/logs remain ignored under .local. Foundation used a separate remitee-check project. Both application runs passed and removed their resources. Compilation used disposable pinned Foundry resources without changing a user's deployment/database. Types, projection and API units were rerun after code corrections; no further contract/foundation runtime change justified repeating those already passing suites.

## Actual HTTP and PostgreSQL coverage

- All five recorded outcomes plus Pending becoming ExpiredRecoverable, successful creation/resolution hashes and the maximum uint256 amount from real contract events.
- Individual/combined normalized address filters, all effective-status filters, matching before pagination, descending IDs, hasMore, empty lists and admitted404 for very large positive IDs.
- Same-snapshot checkpoint/data while the actual Ponder writer advances empty-block progress on another connection.
- Unreachable database, unreachable native readiness and startup-floor API instances, native ready versus global readiness, diagnostic nullability, missing-context refusal with its diagnostic and static specification availability during failure. Engine failure returns 503 for both an existing and an absent ID, with verified heights still visible diagnostically.
- Shared launcher sibling termination and restart, plus unchanged two-additional-block ingestion policy.
- Six exact HTTP time boundaries, advancing only empty blocks: cancel -1/exact/+1 and expiry -1/exact/+1. Detail and both Pending/ExpiredRecoverable SQL filters agree at every boundary. Journal count and null resolution hash remain unchanged.
- RPC loss with 503/no stale data; continuous public samples during within-window rollback validate checkpoint hash against the chain and status against that checkpoint. Beyond-window 503 holds for a full minute, followed by explicit validated fresh-schema replay. No elapsed wait is used to infer reorg depth.
- At steady state, headLag is exactly 2 and eligibleBacklog is 0; expected confirmation waiting is distinguished from unprocessed eligible work.

The CI application job now runs api:spec/api:unit alongside types, projection tests and the expanded indexer:test. Node dev tools are pinned: @redocly/openapi-core 2.76.0, Ajv 8.20.0 Draft 2020-12 and yaml 2.9.1. They read the same canonical file; API runtime uses no schema-validation dependency. Remote CI remains unobserved until publication; old green runs are not reused as S3 proof.

## Independent review and closeout

The candidate-requested subscription-only Opus/xhigh consult exited 0 with no stderr and reported READY_WITH_FIXES. [Exact prompt](../claude/2026-11-07-read-api-implementation-prompt.md) and [unmodified response](../claude/2026-11-07-read-api-implementation-review.md) are retained. Claude performed static reading only; it saw partial first-run evidence, not the later final results. Its response SHA-256 is 224cd73d851f4f0172c25bb6a23daa76c99204a68cb6bcfde432b8e94fed0fdf.

| Review item | Disposition and verification |
| --- | --- |
| D1: native-ready did not prove startup floor | Fixed. A ready engine is reported ready only with matching checkpoint scope and a known satisfied floor; otherwise unknown/catching_up. Real DB-failure and startup-floor HTTP cases assert those states. |
| D2: malformed RPC head looked like DB failure | Fixed. Validate and parse head fields before opening SQL, then reuse headTime. A new fake-RPC regression checks missing timestamp, invalid hash/number and overflowing timestamp: rpc_unavailable with zero DB connections. |
| D3: draft documentation | Updated current guides, OpenAPI metadata and acceptance status. Spec server port is configurable through its documented variable. Historical reviews remain unchanged. |
| T1: public reorg sample was outside loop | Fixed. Every sample round now exercises public detail, validates its checkpoint hash and verifies status for that canonical prefix. Full integration rerun passed. |
| T2: native engine gate lacked independent coverage | Added an API instance with an unreachable INDEXER_PORT, keeping RPC/DB healthy. Existing and missing detail both return 503; health retains diagnostic lag/backlog. |
| T3/T4: expected lag and boundary SQL filters | Assert steady-state 2/0 lag/backlog, and both effective-state lists at all six chain-time boundaries. Passed in the full rerun. |
| T5: context, port and enum checks | Added missing-floor diagnostic, scope-key independence of API_PORT, equal-port refusal and runtime/OpenAPI enum parity. Units and integration passed. |

Optional process-signal/context-pinning hardening, status-query indexing and operational load policy remain future work; no new runtime feature was inferred from those suggestions. The documented RPC/SQL residual race remains. No second model approval is claimed: Codex reviewed the fixes and reran the affected local checks. The user authorized commits without a new push; publication/remote CI remain a separate step.

Claude usage remaining:

- Current session: 80% remaining · resets Nov 7 at 1:30am (America/Buenos_Aires)
- Current week (all models): 91% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
