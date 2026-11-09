# Independent indexer review: disposition and commit gate

Subsequent status: [bounded follow-up executed and Ponder selected](2026-11-06-ponder-decision.md). Decisions in this document record the earlier stage; production integration remains pending.

Date: 2026-11-06. Requested review: Claude Opus / xhigh, before any further commit. Commit ec10164 was already published before this request; this review does not rewrite history. No new commit or production implementation is authorized by a reviewer opinion alone.

## Current decision

**Reopen the engine choice.** Claude finds G4 valid for the tested guard but the engineering conclusion to discard Ponder premature. Codex accepts that correction: the PoC proves a missing projected-checkpoint check, not that a handwritten engine is cheaper or safer. Polling remains the fallback; Ponder is neither adopted nor ruled out until the bounded discriminating test below.

Preserve the [original measurements](2026-11-06-ponder-poc-results.json). Its retain-rpc-polling value records the earlier decision, not an independent validation of that decision. [Unmodified Claude review](../claude/2026-11-06-indexer-validation.md).

## Independently checked findings

| Review point | Codex check / disposition |
| --- | --- |
| G4 uses past-finality behavior intentionally | Confirmed in ponder.config.ts:22: guarded reorgWindow is zero. The observed admitted block is immediately considered final by that profile. Native recovery with window 180 passed P5. Do not generalize G4 to ordinary recoverable Ponder reorgs. |
| Guard never validates latest projected history | Confirmed in src/api/index.ts:11-13 and rpc.ts:16-25: it checks genesis/deployment and native readiness only. The polling proposal also needs a canonical projected-checkpoint guard. Accept. |
| Native readiness is not full application readiness | Confirmed in the pinned package's src/server/index.ts:88-103: it reads the historical is_ready flag. This establishes semantics, not a universal readiness defect. |
| Duration of stale readiness was overstated | run.ts:319-331 takes one HTTP sample after the unrecoverable-reorg log, then stops the instance. Two runs reproduce the sample; neither measures indefinite stale serving or the eventual exit. Correct the report wording. |
| Public block handlers could expose an app checkpoint | Availability confirmed by Ponder 0.18.5 public blocks configuration (src/config/index.ts:225-246), runtime/events.ts:718-727 and the official config reference. Transaction/rollback behavior, ordering and the complete fix remain unexecuted hypotheses. |
| Two-block delay plus a nonzero recovery window is untested | Confirmed: native uses no delayed transport/window 180; guarded uses delay 2/window 0. Do not call the missing combination verified. |

The response reviewed the PoC/harness/guard/configuration; it did not execute tests or independently approve the full PostgreSQL schema. The initial broad consultation stalled with no verdict and was terminated. A bounded retry completed successfully; both attempts and runner usage are preserved.

## One proposed discriminating test

Extend only the existing isolated experiment. Hard stop at **three hours**, drawn from the remaining indexer budget, not added as guaranteed candidate capacity. This is a proposal, not executed work or permission to widen the product scope.

1. Keep two additional blocks of admission delay. Use a positive recovery window, e.g. W=4 **seconds for the test**, rather than forcing every admitted change beyond finality.
2. Through Ponder's supported block event, upsert an application-owned number/hash/timestamp checkpoint for every indexed block, including empty blocks. Ponder remains the only writer and rollback owner; never modify its internal metadata tables.
3. Read that checkpoint and escrow rows from one coherent database snapshot. Validate its canonical hash and current RPC availability before returning application data/health. Avoid treating native /ready as sufficient. Any check/read/check sequence still has an external-chain race; report observation metadata and do not claim an atomic chain/SQL snapshot.
4. Repeat admission/RPC-loss/pre-admission-fork probes. Replace an admitted block within the recovery window: sample the public API through the controlled fork, settle to canonical Rejected and remove the orphan. Replace history outside the window: require public data and health to fail closed for at least 60 seconds, remain safe after restart, then prove explicit validated replay.
5. Stop for an observed orphan response, incoherent checkpoint rollback/commit, unsupported API dependency or timebox exhaustion. Retain polling, reusing the guard/harness, if that happens. Passing permits a deliberate SDD revision; it is not full S2/S3 acceptance.

Two corrections to the proposed test: **W is seconds, N is blocks**; do not add W+2 or infer recovery depth from a variable block cadence. Control/assert actual header timestamps to select within/outside-window cases. A lag cap 2+k is an additional optional freshness policy, not a challenge requirement; choose k explicitly if used.

Also account for a real integration boundary the review did not resolve: Ponder 0.18.5 reserves native `/health` and `/ready` (src/build/index.ts:593-600), and native `/health` is liveness-only. The follow-up must prove the required public health response through a supported facade/routing design; do not assume a custom Hono `/health` can override the reserved route.

## Documentation and verification

Canonical status is engine choice under review; polling is a fallback. Halt/replay versus normal rollback, block admission and physical cursor/lock ownership are our implementation choices. The challenge's durable/idempotent recovery, read endpoints, honest health and time-derived eligibility remain required.

Claude's 2-4 hour test estimate and subsequent day ranges are opinions, not measured throughput; the hard three-hour stop takes precedence. No delivery date or extra candidate hours are silently assumed. No new runtime test was run during this review: Codex verified cited code and public API availability, corrected the conclusion and prepared the next gate. AC6-AC8 remain unverified. All review changes are left uncommitted for candidate review.
