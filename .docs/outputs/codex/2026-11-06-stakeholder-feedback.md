# Stakeholder feedback and confirmation configuration verification

Date: November 6, 2026. Scope: record the candidate-supplied employer reply, retain the selected cancellation semantics and verify requested environment configurability. No contract or indexer runtime behavior was changed.

## Decisions

- [Supplied clarification](../../references.md#stakeholder-clarification-recorded-november-6): internal-process consumers and expected network delay are acceptable. No exact freshness SLA, authentication mechanism or chain migration was required.
- First successful canonical resolution still wins. Immediate beneficiary confirmation can close the sender's cancellation opportunity before two hours. This avoids a mandatory settlement wait but gives no exclusive cancellation right. Successful release is terminal; a voluntary return would be a separate transfer.
- Real restricted internal deployments should evaluate service identity and read authorization. #14 receives this context as an appended note; the challenge keeps the existing anonymous local scope.
- CONFIRMATION_DELAY already exists in .env.example and settings(), defaults to 2, and accepts integers 0..10000. It controls the delayed RPC transport, startup floor and read-observation guards/metadata. Only example comments and documentation needed clarification.
- Delay counts additional blocks after inclusion. Configuration is read at startup. Changing it changes the scope key and requires a fresh data scope/replay under the current policy. No persisted scope was modified during this task.

## Verification performed

The existing npm run indexer:unit suite passed: 16 tests, 0 failures.

An isolated Node probe exercised the actual settings() and chainReader().delayedRequest functions against a loopback mock RPC. The test descriptor and server were temporary and removed. No database, live chain, transaction or Ponder engine was involved.

| Configured delay | Mock chain head | Exposed eligible head | Latest block / log range | Block above eligibility |
| --- | --- | --- | --- | --- |
| 0 | 12 | 12 | Returned/clipped to block 12 | Rejected |
| 2 | 12 | 10 | Returned/clipped to block 10 | Rejected |
| 6 | 12 | 6 | Returned/clipped to block 6 | Rejected |

The probe also confirmed the omitted-value default of 2, rejection of -1, 1.5, 10001, nonnumeric and empty values, and a changed scope key for a different delay. This verifies the configuration-to-transport boundary; it is not a new full Ponder/PostgreSQL integration run or live-network latency measurement. Existing application integration evidence remains linked from [progress](../../progress.md).

## Documentation changes

[Runtime configuration](../../indexer-runtime.md#configuring-admission-depth) now includes units, limits, restart/replay behavior and an override example. Local deployment still mines two setup blocks; a larger chosen delay needs enough additional local blocks before readiness. The SDD, API guide, source summary and flow explanation reflect the supplied reply. Authentication remains future work; no provider or middleware was added.
