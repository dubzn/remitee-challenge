# Pre-commit review disposition and infrastructure ordering

Date: 2026-11-04. The candidate requested Claude Opus/xhigh review, commit/push if no major corrections, an infrastructure-first block with Docker/CI, GitHub tracking and divided ownership. No escrow implementation was authorized.

## Review result and corrections

Claude returned **READY_WITH_MINOR_FIXES**, with no major documentation blockers. Preserve its [exact prompt](../claude/2026-11-04-preflight-prompt.md) and [unmodified response](../claude/2026-11-04-preflight-review.md). File/line references there describe the reviewed revision, before these corrections.

- Made basic CI baseline and timeboxed throughout the current SDD/delivery/reference documents. Compose includes Anvil and PostgreSQL. Reallocated existing setup/DB/demo budget and one contingency hour rather than adding a second infrastructure allowance. Revised functional-core target to Sat Nov 7; Mon Nov 9 remains conditional.
- Documented explicit joint reset/chain identity checks, real positive and negative foundation probes, separate PostgreSQL databases for parallel workers and isolated or serial Anvil time travel. Foundry unit tests do not need Docker.
- Changed the expiry diagram to latest observed head timestamp; listed required event names and early event-signature freeze in AC5. Four full diagrams had already been rendered and visually inspected; this label refinement does not evidence runtime behavior.
- Kept pause as an open authority decision. The PDF permits an owner to exist while forbidding privileged fund movement; Claude's phrase "assumes an owner" does not mean an owner is required. No pause/owner ban was inferred.

## Independent qualifications

The overlapping-range cases have distinct outcomes: a fully processed old range is a no-op; a stale expected predecessor rejects the transaction; a valid overlap extending the cursor deduplicates its prefix and applies only the new tail. The cursor never moves backward outside explicit validated reset. These are separate test cases, rather than one ambiguous result.

Per-event blockHash/header validation and range-end recheck are now explicit. Missing/inconsistent data cannot commit; this reduces ordinary inconsistent-RPC responses without promising cryptographic verification or eliminating the residual fork race. Observed-head time and indexed state can differ; reported metadata and eligibility limits remain explicit.

Checked [PostgreSQL's database-local advisory lock scope](https://www.postgresql.org/docs/current/view-pg-locks.html), [GitHub's action provenance/SHA guidance](https://docs.github.com/en/actions/reference/security/secure-use) and [Compose readiness](https://docs.docker.com/compose/how-tos/startup-order/) against primary documentation. These references guide later implementation; no runtime claim follows from reading them.

Issue creation is within the candidate's explicit request to track progress in GitHub. Codex verified repository access and the empty issue search. No additional authorization is required to create the requested tracker.

## Ownership and evidence boundaries

Codex owns shared root configuration, Compose, runtime probes, shell execution, contract/core tests and integration. Claude receives the bounded CI file edit after commands stabilize, later adversarial test files after event ABI freeze, and independent reviews. The runner's edit mode lacks shell execution; assigning the core contract to the agent running Foundry avoids a slow test handoff loop. No concurrent editing of shared files.

The [infrastructure plan](../../infrastructure-plan.md) links the seven work blocks and their dependencies. Foundation and initial CI precede business implementation; no speculative schema, broker, provisional journal, dashboard or gateway is added. Pause policy must be closed before the contract slice.

At this review, Docker CLI/Compose were installed but the daemon was unavailable. No application, contract, Docker config, workflow or runtime tests were created or passed. Repository links/structure, current scope consistency and the documentation diff are the publication checks. AI review is not a security audit, and the 32-44 hour range is not measured throughput.
