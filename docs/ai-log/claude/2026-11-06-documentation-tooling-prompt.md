# Documentation tooling review

Read-only review, in English, at most 700 words. Do not edit, execute commands, request approval, delegate or browse. Deliver the opinion directly; optionally read only the local files listed below. The candidate explicitly requests a second opinion on documentation tooling with Claude xhigh; retain the previously requested Opus model. This is planning/issue creation, not authorization to implement docs/UI now.

## Context and evidence

Today November 6, 2026. One-week Remitee escrow challenge; candidate 5-6 effective hours/day. Infrastructure, 62 Solidity tests and Ponder application indexer are implemented and CI-verified. Next is S3 public read API; S4 demo and S5 final documentation/rehearsal remain. Candidate now asks for GitHub issues covering API OpenAPI specifications + Swagger UI, and contract NatSpec + forge doc, or a bounded better alternative.

Pinned stack: Foundry 1.4.1, Solidity 0.8.30/Cancun, Node 24.14.1, TypeScript 5.9.3, Ponder 0.18.5, Hono 4.13.16, PostgreSQL 17.11. Ponder's existing Hono /observed endpoints are internal S2 diagnostics, not the final S3 API. Native Ponder reserves /health and /ready. Final public API framework is not separately frozen.

Public requirements: GET /escrows/{id}, GET /escrows with sender/beneficiary/effective-status filters plus bounded newest-first pagination, GET /health. Decimal-string uint256 IDs/amounts; recorded Pending vs derived ExpiredRecoverable; chain-time eligibility/deadlines; observation/canonical checkpoint/delay/backlog; 400 malformed, 404 absent, 503 unverifiable/unready. API never signs/sends transactions. Creation-time filters remain optional; no new endpoints or business features are implied by documentation.

Contracts: Escrow/IEscrow, five actions/events, constants, struct/enum/custom errors. Currently only top-level notice/dev comments; public interface is mostly undocumented. Sender cancel iff t<created+2h; beneficiary confirms/rejects iff t<created+7d; sender recovers iff t>=expiry. Time never moves funds by itself; no pause/admin/upgrades; ERC20 token limitations documented already. Treat comments as documentation, not an audit or a reason to change behavior.

Codex verified forge doc --help in the actual pinned container: generation, --build, --serve, --hostname, --out, --include-libraries exist. Do not assume mdbook is installed or HTML generation succeeds. Current primary docs support OpenAPI 3.1 and Swagger UI serving one shared definition. Hono has optional OpenAPI/Zod and Swagger adapters; avoid assuming its default asset hosting is offline-compatible. No new dependency installed by this task.

## Optional bounded source reads

- .docs/sdd/escrow.md (API boundary, AC9-AC12)
- .docs/progress.md
- contracts/src/IEscrow.sol and contracts/src/Escrow.sol
- apps/indexer/src/api/index.ts

## Decision to challenge

Tentative: two focused issues. (1) Define a single versioned OpenAPI 3.1 artifact first, serve it and Swagger UI in the eventual public API, self-host pinned UI assets, validate spec and representative actual HTTP responses to reduce drift. For only three endpoints, prefer a framework-neutral spec-first file unless S3 selects shared runtime schemas; assess Hono + Zod OpenAPI only if it actually reduces duplicate definitions. No SDK generation, hosted portal, extra server stack or paid service. (2) NatSpec on public contract/interface/ABI surface with inheritdoc where verified; forge doc output in ignored build location, reproducible generation and local serving. Verify doc inheritance/events/errors/structs, do not duplicate per-method prose across files. Pin any real mdbook requirement. Alternative only if pinned forge doc demonstrably fails this scope.

## Required judgment

Recommend or correct each tool choice; distinguish facts from assumptions. Explain spec-first vs code-first tradeoffs without forcing a framework rewrite. List missing high-value acceptance checks, docs availability during RPC/DB outage, hidden CDN/build-tool issues and whether a single-file spec plus response checks is proportional. For contracts, distinguish NatSpec source, forge doc generation and rendered HTML/hosting, and ABI vs bytecode effects of comment changes. Give two concise issue outlines with dependencies, non-goals and rough incremental effort (assumptions, not measured hours or a new guaranteed deadline). Keep the reviewer documentation mandatory as newly requested, but distinguish it from the employer's literal functional requirements. Do not claim any implementation or test execution.
