# TypeScript readability refactor

This pass addresses TypeScript readability before final delivery, with Claude review. The [acceptance checklist](../../sdd/typescript-readability.md) limits this to named responsibilities and equivalent behavior.

## Changes and decisions

- HTTP dispatch stays in api/server.ts; health probes/partial diagnostics move to api/health.ts and shared error sanitization to api/errors.ts. Query parsing, SQL construction and response shaping have named helpers.
- queryObservation now visibly sequences deployment verification, valid head capture, one read-only snapshot, checkpoint validation and chain rechecks. Transaction ownership, guard order, error codes and trace updates are retained.
- The demo uses explicit action/caller/recipient/status records instead of parallel arrays, boolean tuples and i+1. Helpers name preflight, deposits, payouts, passive expiry, recovery and final verification. The launcher separates startup context, process spawning and sibling supervision.
- Helpers stay in existing scripts so the packaged script list stays unchanged. No new dependency, generic service framework, transport rewrite, SQL schema, OpenAPI or Solidity change was introduced.

## Executed verification

- Root and indexer type checks passed. Projection/config units: 16 passed. API units: 11 passed. OpenAPI: 14 example uses and six rejected invalid fixtures.
- Four API regressions cover parser precedence, RPC failure versus engine unreadiness and partial diagnostics, head below delay rejecting block zero, and callback failure rolling back/releasing. All 11 API tests also passed against a plain-text HEAD runtime snapshot, confirming the new cases describe existing behavior.
- Real PostgreSQL/Ponder/HTTP integration passed all 18 observations, including interrupted writes, competing writer, restart, RPC failure, within/beyond-window forks and explicit replay.
- Full Docker acceptance passed all 10 checks, including two demos, exact per-action payouts/getters/traces, policy preflight before writes, restart and incompatible-state refusals. The isolated test projects removed their own resources; existing development data was not reset.
- After those runs, only a type-only narrowing, test-fixture formatting, local renames and explanatory comments changed. Types/API units were checked again. No new remote CI result is claimed.

## Review scope

[Initial Opus/xhigh review](../claude/2026-11-09-typescript-readability-review.md) identified the main phases and ordering traps. The [second review](../claude/2026-11-09-typescript-readability-final-review.md) found no required fixes in the current code and considered the extraction proportionate. It could not inspect Git objects; it did not complete the requested old/new comparison. Its advice is static evidence, not test execution. Minor naming, shadowing and precedence/diagnostic comments were applied. Existing module re-exports and the optional trace argument were retained rather than changing their callers during this pass.

The [bounded source comparison](../claude/2026-11-09-typescript-equivalence-review.md) closed those questions with no correction required. It checked the demo's assertions/output, hash-error order, 42P01/identity classification, startup floor and supervision against exported HEAD files. I independently verified those baseline files byte-for-byte against HEAD and confirmed rpc.ts is unchanged.

Harmless differences are explicit: the local demo reads two extra balances during passive-expiry verification, groups balance reads before assertions, and can report a different first DEMO_FAILED mismatch when several facts are wrong. Expected outputs, writes, mining and successful outcomes remain the same. No broader transport or test-coverage guarantee follows from the static review.

Logs and the plain-text baseline remain under ignored .local/typescript-readability-2026-11-09. Historical AI responses are unmodified. This pass was left uncommitted for review; the [follow-up](2026-11-09-typescript-cleanup-biome.md) records the subsequent cleanup and quality gate.
