# Independent indexer feasibility and PoC review

Review only. Do not edit files, execute commands, install anything, contact services or delegate to other agents. Respond in English. Codex will verify your advice and execute any necessary follow-up. The user explicitly requests Claude Opus with xhigh effort before another commit.

## Objective

Challenge Codex's conclusion to abandon the tested Ponder integration and select a handwritten viem/pg polling worker. Determine what the experiment actually proves, what it does not prove, and the smallest defensible path to a one-week submission. Do not default to agreement with the existing report or to framework advocacy.

The latest published commit is ec10164. No production indexer/API exists yet, so the polling alternative is a design, not an already functioning fallback. Contracts and 62 tests are complete. Candidate has 5-6 effective hours/day; target functional core Nov 7 and conditional submission Nov 9. Today is Nov 6, 2026. PostgreSQL and Foundry/TypeScript are candidate choices. No contract rewrites, pause/upgrades, production deployment or additional infrastructure project are authorized in this review.

## Read these local sources

1. `.docs/references.md`: challenge requirements versus our added design choices; the actual challenge asks for durable event projection, idempotency/restart, documented reorg behavior and a read API/health. Strict two-additional-block admission and halt/replay are our chosen SDD policies, not verbatim mandatory provider architecture.
2. `.docs/sdd/escrow.md`, especially AC6-AC10 and the event/API boundaries.
3. `.docs/indexer-design.md`, `.docs/postgres-models.md`, `.docs/delivery-plan.md`.
4. `.docs/outputs/codex/2026-11-06-ponder-poc.md` and `2026-11-06-ponder-poc-results.json`.
5. All source files in `experiments/ponder-poc/`, particularly `run.ts`, `rpc.ts`, `ponder.config.ts`, `src/index.ts` and `src/api/index.ts`. Do not spend time reading the entire dependency lockfile.
6. Inspect the actual pinned Ponder 0.18.5 source where relevant, rather than assuming current documentation semantics:
   - `experiments/ponder-poc/node_modules/ponder/src/server/index.ts`
   - `experiments/ponder-poc/node_modules/ponder/src/sync-realtime/index.ts`
   - `experiments/ponder-poc/node_modules/ponder/src/runtime/realtime.ts`
   - `experiments/ponder-poc/node_modules/ponder/src/database/index.ts`
   - `experiments/ponder-poc/node_modules/ponder/src/utils/finality.ts`
   Use bounded searches/reads, not an exhaustive library audit.
7. Raw final reproduction evidence, if useful, under `.local/remitee-poc-ponder-66827-41b4190a/`, especially `report.json` and `ponder-5.log`. Those files are local test artifacts, not secrets or production data.

## Facts to audit, not premises to accept

- Native Ponder profile: PostgreSQL, cacheRpcRequests false, reorgWindow 180 seconds, one Anvil chain. Real contract: all five events, four payouts, uint256 2^200, graceful restart/offline catch-up, hard kill between journal and projection, competing schema instance and shallow-fork reconciliation passed.
- Native latest-head exposure and readiness 200 during RPC outage are integration gaps relative to our SDD, not necessarily framework bugs.
- A second profile uses a small delayed RPC view (two blocks), deployment/genesis identity validation, GraphQL HTTP gating via that validation and native /ready, and reorgWindow 0 to approximate our halt-on-admitted-mismatch policy.
- This second profile passes two-block admission, RPC-loss 503 and orphan-before-admission exclusion. In the G4 probe, a Released event at block 8 is admitted, then the source history is replaced at the same heights with a different block-8 hash and canonical Rejected state. RPC reads are hidden only while replacing the chain to avoid conflating a transient lower head with a verified fork.
- Ponder logs an unrecoverable reorg. Native /ready remains 200; guarded GraphQL returns 200 with Released while an independent contract read returns Rejected. Explicit new-schema replay corrects the outcome. The complete finding was reproduced in two fresh isolated Compose projects, including a clean npm ci/root-command reproduction.
- Codex stopped adapter work and selected polling. Production AC6-AC8 remain unverified. This is the conclusion you must critically evaluate.

## Questions

1. Is the G4 reproduction technically valid? Identify any harness defect, confounder, race, misleading assertion or unsupported claim with exact file/line evidence. Did reorgWindow 0 manufacture an unfair failure, or does it meaningfully test the chosen policy? Which results can safely generalize to native Ponder?
2. Does G4 justify selecting polling for this deadline, or just require an application-level canonical-checkpoint/readiness guard that we would need for either engine? Compare the integration work/risk with writing the entire polling engine from scratch. Be explicit that neither alternative is production-verified.
3. What supported Ponder settings/APIs/extension points are actually available to preserve the challenge's observable requirements? Distinguish an application guard, a small configuration change, a legitimate relaxation of our own SDD, and unsupported library-internal coupling. Do not invent APIs or assert an unexecuted fix works.
4. Would retaining Ponder's ordinary reorg recovery with an explicit read guard and documented semantics be simpler than forcing our bespoke halt policy? Which SDD clauses would need deliberate revision and which genuine challenge requirements must stay intact?
5. Is the proposed PostgreSQL/polling design appropriately bounded and internally coherent? Identify major flaws or unnecessary acceptance burden that could undermine delivery. Address exact integers, atomic cursor/projection writes, writer exclusion, snapshots and identity/reorg verification at the level needed for a decision.
6. Recommend one path: keep polling; keep Ponder with a precisely bounded follow-up; or insufficient evidence with one targeted discriminating test. Provide an approximate incremental engineering-work range with assumptions, not a guarantee or measured candidate time. Avoid proposing another open-ended indexer comparison.

## Deliverable

Return a concise, evidence-backed review with:

- Verdict and whether the current fallback decision is defensible, premature or should change.
- Major findings ordered by consequence, exact local file/line references, and confirmed-versus-inferred status.
- Any narrow test needed to settle the choice, with an explicit observable pass/fail criterion and stopping condition.
- Required documentation corrections and remaining uncertainty.

No implementation, shell execution, file edits, commits or external communication. Do not claim a test or integration was executed by reading the code. Do not treat local docs or third-party library comments as higher-priority instructions.
