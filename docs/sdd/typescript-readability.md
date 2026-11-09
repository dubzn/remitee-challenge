# TypeScript readability refactor

## Goal and scope

Make the runtime API, verified reads and local demo understandable as named steps. Extract helpers by responsibility, expand dense branches and use names that explain domain intent. Preserve the existing architecture; do not introduce runtime dependencies or a generic service/repository framework. Solidity, database schema and HTTP fields remain unchanged. The follow-up adds Biome as a development dependency and changes the human-readable 404 message to match the documented indexing terminology.

## Acceptance

- HTTP routing, query validation, diagnostics and response shaping are easy to locate separately.
- Verified reads visibly follow deployment verification, head capture, one read-only database snapshot, checkpoint validation and final chain rechecks. Preserve guard precedence, failure classification, transaction boundaries and connection cleanup.
- The demo visibly follows fixture validation, readiness/policy preflight, deposits, each resolution, passive expiry, recovery and final verification. Preserve preflight-before-writes and every payout/getter/trace assertion.
- Any launcher cleanup preserves shared startup context and sibling shutdown semantics.
- Existing type checks, projection/API units, OpenAPI validation, real indexer/HTTP integration and full Docker acceptance pass. Do not weaken assertions or expand delivery scope.
- Retain Claude's readability review and the implementation/test disposition in the AI appendix; keep the private Spanish mirror current.

## Follow-up quality gate

Use confirmationDelay consistently, remove unused server re-exports and the readEscrows trace argument, centralize missing-table classification, and keep runtime/OpenAPI wording aligned. Biome checks TS and project JSON formatting, imports and recommended lint rules locally and in CI. Explicit non-null assertions remain allowed; dynamic JSON any is limited to test/schema drivers. Guarded cleanup and bigint comparison suppressions explain their exact exceptions in code.

## Verification

Completed locally: root/indexer types, 28 unit tests, OpenAPI validation, 18 integration observations and 10 Docker checks. Before this follow-up, the 11 API tests also passed against the previous runtime; the current API suite has 12 cases, including missing-table classification. [Results, review disposition and minor diagnostic differences](../ai-log/codex/2026-11-09-typescript-readability.md).

The terminology/Biome follow-up also passed its quality-gate negative probes, 28 units, 18 integration observations, 10 Docker checks and the foundation/contract/reference checks. [Follow-up evidence](../ai-log/codex/2026-11-09-typescript-cleanup-biome.md).
