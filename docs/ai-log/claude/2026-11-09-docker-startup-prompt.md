# Review S4 Docker-only startup and lifecycle demo

Read-only Opus/xhigh review for the current Remitee challenge slice. Respond in English. Do not edit files, execute commands, use other agents, read .env/credentials or broaden project scope. Review the actual working-tree files, not an old diff snapshot. This is implementation review before closing local S4; no commit/push is requested in this slice.

Candidate authorized S4 and explicitly prefers Node as well as Anvil/PostgreSQL in Docker. Preserve existing escrow rules, simple ERC-20 assumptions, shared Ponder/API application, delayed indexing/read guards and host workflow. No Solidity changes, production deployment, wallet UI, signing key, broker, new API endpoints or automatic history reset are permitted.

Read:

- Dockerfile.app, .dockerignore, compose.yaml and .github/workflows/foundation.yml application job.
- scripts/deploy-local.ts, scripts/build-artifacts.ts, scripts/demo.ts and scripts/compose-acceptance.ts.
- apps/indexer/config.ts apiListenHost/admissionDelay, scripts/read-api.ts, existing scripts/indexer.ts and the new config assertions in apps/indexer/test/unit.test.ts.
- .docs/docker-demo.md and .docs/outputs/codex/2026-11-09-docker-startup.md; SDD S4 L1-L5/AC11.
- Only if useful: .local/remitee-app-check-88797-524add1b/report.json and .local/docker-startup-2026-11-09/acceptance-fourth.log. These are execution observations supplied by Codex, not tests you executed.

Observed by Codex: the final default-delay run passed nine Docker checks: full single-command build/start and actual public health/OpenAPI; two actual four-outcome demos with recoverable expiry and balances/hashes; reuse without deployment transaction; application restart preserving payloads; DB outage 503 with static spec/recovery; changed packaged build refusal without transaction; persisted-policy refusal while active service stays healthy; disposable-chain loss refusing descriptor reuse while preserving all eight DB rows. Owned resources removed. Host workflow regression also passed all 18 actual indexer/API observations, 16 config/projection tests, seven API tests, spec checks and foundation smoke/negative checks. Additional full Docker runs at delay 0 and 6 are in progress; do not infer they passed until their evidence says so. New CI job is configured, not observed remotely.

Known discovered packaging issues were fixed and retested: default per-service image tags auto-built the first demo and contaminated JSON stdout with build logs; sharing a tag with two build declarations caused concurrent export collision; deploy alone now declares the build and app/demo use its local image. Ephemeral API port can change after restart; the driver now re-resolves it. Exact one-command startup passed with a fresh project/image tag after these corrections. Do not present earlier partial/failed runs as full success.

Review for concrete correctness and scope:

1. Does the default reviewer command really start the full fixture with no host Node/npm/Foundry, and do image/deployment/readiness dependencies match that claim?
2. Are local write-capable deployment/demo boundaries sufficiently constrained without weakening the read application's existing signing/identity/scope guarantees? Are failure/restart/reset semantics honest?
3. Is demo evidence meaningful for four distinct outcomes, real hashes, role/recipient/balance rules, expiry before recovery and configurable admission delay? Identify false-positive test claims or missing essential assertions.
4. Are Docker build context, non-root runtime, internal/public binds, shared artifacts and selected-project cleanup correct? Flag concrete startup/platform bugs, not a general production-hardening project.
5. Which documented assumptions/decisions need candidate attention? Distinguish inherited policy and candidate preference from new choices.

Return READY, READY_WITH_FIXES or BLOCKED; severity/file/line evidence for findings, required versus optional fixes and disposition recommendations. No findings is acceptable. Readiness claims and tests are local only; S5 candidate rehearsal stays open. Static review is advice, not executed proof or authorization for publication.
