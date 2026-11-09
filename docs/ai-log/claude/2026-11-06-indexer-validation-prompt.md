# Bounded retry: independent indexer decision review

Read-only review. English response, at most 800 words. Do not edit, execute commands, request approval, delegate or plan an implementation. Deliver the review directly from the evidence below. Optional: read only the three listed files if needed; do not perform an exhaustive repository/library search. An earlier invocation stalled without delivering a response; this is a separate bounded retry using Opus/xhigh.

## Context

We have one ordinary Solidity Escrow, five events, Foundry/TypeScript, PostgreSQL. Contracts/tests complete; neither production Ponder integration nor custom polling worker is implemented. Today Nov 6, target conditional submission Nov 9, candidate 5-6 hours/day.

Challenge requires durable/idempotent indexing, restart, a documented reorg policy, GET detail/list/health and time-derived expiry. Strict two-block admission, journal/cursor transaction details and halt-on-reorg rather than automatic rollback are our own SDD choices, not literal mandated framework architecture.

## Executed evidence (Codex, not you)

Pinned Ponder 0.18.5, real Anvil/PostgreSQL and real Escrow. Native reorgWindow=180, cacheRpcRequests=false, ponder start:
- Historical five-event/four-outcome reconstruction, exact uint256 2^200, restart/offline catch-up, SIGKILL between journal/projection, competing-writer exclusion and shallow-fork recovery all pass.
- Native GraphQL exposes new records immediately and /ready stays 200 during RPC outage. These are gaps versus our selected admission/readiness policy, not automatically framework bugs.
- Codex tried a small guarded profile: delayed RPC latest head by two blocks; reorgWindow=0; GraphQL middleware validates chain ID/genesis/deployment anchor plus native /ready. This passes two-block admission, RPC-loss 503 and pre-admission fork exclusion.
- G4 then admits Released at block 8, replaces history at the same heights with a different block-8 hash and actual contract state Rejected. Reads are hidden during replacement to avoid transient-height confusion. Ponder logs an unrecoverable reorg, but /ready=200 and guarded GraphQL=200 with orphan Released. This was reproduced twice from fresh isolated Compose projects. Explicit new-schema replay fixes it.
- The guard checks the deployment block, not the latest projected checkpoint. It does not verify canonicality of later indexed state. Reading exact pinned source confirms /ready checks historical-backfill is_ready; unrecoverable reorg is thrown into the realtime retry path, not immediately propagated to that API readiness flag.
- Codex selected custom polling as fallback: canonical deployment/checkpoint hash checks, one writer, atomic journal/projection/cursor, explicit halt/replay. This is a design, not tested production implementation.

## Optional bounded local evidence

1. `.docs/outputs/codex/2026-11-06-ponder-poc.md`
2. `experiments/ponder-poc/run.ts` (G1-G5 near the end)
3. `experiments/ponder-poc/src/api/index.ts` (21 lines)

## Required independent judgment

1. Is G4 a valid negative control for the tested guard/policy? What does reorgWindow=0 let us conclude, and what would be an unfair generalization to ordinary Ponder?
2. Is discarding Ponder justified or premature when both approaches need canonical read-readiness? Could a small application-owned block/checkpoint model and public block handler/read guard preserve requirements without a second indexing engine? Treat that as a candidate to verify, not an already proven feature/fix.
3. Compare retaining normal Ponder rollback plus an application guard against writing polling from scratch. Identify which SDD decisions can reasonably change and which actual challenge requirements cannot. Do not treat our original architecture as an employer constraint.
4. Recommend one path or one discriminating test, with explicit pass/fail and stop conditions. Give a rough incremental effort range with assumptions. No open-ended provider comparison.
5. List any material corrections needed to Codex's report/decision. Separate observed facts, your inferences and untested possibilities. Do not claim you ran any tests.

Return: verdict; up to five major findings; one bounded next action; remaining uncertainty. Be candid if the evidence cannot establish a universal framework conclusion.
