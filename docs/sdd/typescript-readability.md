# TypeScript readability refactor

## Goal and scope

Make the runtime API, verified reads and local demo understandable as named steps. Extract helpers by responsibility, expand dense branches and use names that explain domain intent. Preserve the existing architecture; do not introduce runtime dependencies or a generic service/repository framework. Solidity, database schema and HTTP fields remain unchanged. The follow-up adds Biome as a development dependency and changes the human-readable 404 message to match the documented indexing terminology.

## Acceptance

- HTTP routing, query validation, diagnostics and response shaping are easy to locate separately.
- Verified reads visibly follow head capture, one read-only database snapshot, checkpoint validation and final chain rechecks. Deployment identity is checked at bootstrap under the current [RPC budget](escrow.md). Preserve transaction boundaries, connection cleanup and the documented hash-error precedence.
- The demo visibly follows fixture validation, readiness/policy preflight, deposits, each resolution, passive expiry, recovery and final verification. Preserve preflight-before-writes and every payout/getter/trace assertion.
- Any launcher cleanup preserves shared startup context and sibling shutdown semantics.
- Existing type checks, projection/API units, OpenAPI validation, real indexer/HTTP integration and full Docker acceptance pass. Do not weaken assertions or expand delivery scope.
- Retain Claude's readability review and the implementation/test disposition in the AI appendix.

## Follow-up quality gate

Use confirmationDelay consistently, remove unused server re-exports and the readEscrows trace argument, centralize missing-table classification, and keep runtime/OpenAPI wording aligned. Biome checks TS and project JSON formatting, imports and recommended lint rules locally and in CI. Explicit non-null assertions remain allowed; dynamic JSON any is limited to test/schema drivers. Guarded cleanup and bigint comparison suppressions explain their exact exceptions in code.

## Verification

The published runtime passed root/indexer types, 34 unit tests (18 indexer and 16 API), OpenAPI validation, 19 actual indexer/HTTP observations and 13 full Docker checks. [CI run 42706226302](https://github.com/dubzn/remitee-challenge/actions/runs/42706226302) also passed foundation smoke/failure checks, 62 contract tests and generated contract-reference validation.

The original refactor's baseline comparison and diagnostic differences remain in the [readability record](../ai-log/codex/2026-11-09-typescript-readability.md). The [terminology/Biome record](../ai-log/codex/2026-11-09-typescript-cleanup-biome.md) retains earlier counts and quality-gate negative probes; later [RPC verification](../ai-log/codex/2026-11-09-rpc-optimization.md) records the expanded coverage above.
