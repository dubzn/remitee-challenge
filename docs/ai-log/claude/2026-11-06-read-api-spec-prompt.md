# Bounded S3 OpenAPI review

Review the current draft `.docs/api/openapi.yaml` as a read-only second opinion. Use English. Do not edit files or run commands. Return READY, READY_WITH_FIXES or BLOCKED, concrete findings with severity and file/section evidence, and the smallest corrections needed before implementing HTTP handlers. Distinguish requirement conflicts, proposed defaults and optional improvements. Codex will independently validate schemas/examples and own implementation.

Context: one-week Remitee challenge, existing Foundry escrow and Ponder/PostgreSQL indexer complete. The next agreed deliverable is the HTTP specification and examples for candidate review before handlers. S3 acceptance is still open. The working tree has pre-existing documentation edits; do not treat them as your changes. No new contract behavior, engine switch, live-network deployment, wallet UI, transaction submission, cache or AuthN/AuthZ implementation. Swagger UI is optional. Current local delay is environment-configurable at 2 additional blocks, not consensus finality.

Read only the relevant sections of:

- `.docs/api/openapi.yaml`: the artifact under review, including inline examples.
- `.docs/sdd/escrow.md`: AC9/AC10, API boundary and selected pagination/time semantics.
- `.docs/read-api-design.md`, `.docs/spikes/003-api-time.md`.
- `.docs/references.md`: candidate-supplied employer clarification; internal processes and network delay are acceptable, no precise SLA or auth mechanism mandated.
- `apps/indexer/read-model.ts`, `config.ts`, `rpc.ts`, `ponder.schema.ts`, `projection.ts`, `src/api/index.ts` and `scripts/indexer.ts` for actual snapshot, readiness, identity and hosting constraints.
- `contracts/src/Escrow.sol` only if needed to confirm time/terminal semantics.

Evaluate specifically:

1. Exactly three required GET business routes, no extra scope. Separate consumer listener planned at localhost:3000 because Ponder reserves native /health; public means consumer contract, not internet exposure. Is this a sufficiently clear, small implementation boundary?
2. IDs/amounts and all Unix-second timestamps are canonical decimal strings (uint256/uint64 respectively), with positive IDs/amounts. Patterns/length are only syntactic; the description and x-maximum-decimal require exact runtime BigInt bounds. Is any lossless representation or error behavior missing? Old worked examples were proposals; the new OpenAPI is intended to own exact public names and types.
3. Sender/beneficiary AND effective-status filters before SQL pagination, descending ID, limit default20/max100 and offset default0/max10000. These are bounded candidate defaults, not quoted employer requirements. Empty/repeated/unknown query input is 400; invalid input precedes readiness. No cursor or optional creation-time filters.
4. Derive effectiveStatus/canCancel/canRecover from one observed canonical head time and emitted deadlines. ExpiredRecoverable requires no recovery event; recorded Expired does. Read-time role eligibility never promises token transfer success or identifies the HTTP caller.
5. Same-snapshot rows/checkpoint and verified observation; 404 reports absence only in the admitted projection and includes that observation. No stale-success fallback; 503 when unready/unverifiable. Canonical older prefixes may remain ready with visible lag/backlog after the startup floor. Residual RPC/SQL race stays documented.
6. Health200 carries verified progress; health503 carries component status, null observation, reason and nullable diagnostic head/checkpoint explicitly labeled unverified/possibly last-known. Do these expose honest health without requiring a new durable observer/cache? Any contradictory component/readiness semantics?
7. Nullability of successful resolution hashes, recorded versus derived state, examples and Cache-Control:no-store. Which cross-field invariants belong in runtime behavior tests versus JSON Schema? Avoid demanding a second schema source or an oversized test platform.

End with a concise S3 implementation checklist and any remaining material decisions. Do not reopen confirmed contract cancellation semantics, fee/rebase support, production authentication or Ponder engine selection. Do not claim execution evidence: you have read/search tools only.
