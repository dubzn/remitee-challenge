# Ponder decision and persistence proof

Date: 2026-11-06. **Select Ponder 0.18.5 for this challenge.** The candidate authorized the bounded follow-up and choosing one engine based on stability and clarity. [Raw observations](2026-11-06-ponder-follow-up-results.json) supersede the original polling decision; the earlier [Opus/xhigh review](../claude/2026-11-06-indexer-validation.md) motivated the test, not a new review of this implementation.

## Decision and scope

Ponder owns ordered ingestion, its durable engine cursor, transaction boundaries, writer exclusion and rollback history. Application code owns the normalized event journal, escrow projection, public block-handler checkpoint and read guard. Use one writer; do not build a competing polling engine. Keep the polling design as an archived contingency, not another delivery requirement.

The existing contract, Anvil, PostgreSQL and five events were exercised. This closes the engine-selection spike. The code remains under experiments/ponder-poc; production deployment, final API, full S2/S3 acceptance and CI integration are still pending.

## Executed evidence

Command: `npm run poc:ponder` with pinned Node 24.14.1 and the independent installed experiment lockfile. Final run: `remitee-poc-ponder-80370-eccb1a81`, exit 0. Driver cleaned only its generated containers/volume; development services were left running. Root and experiment TypeScript checks passed.

| Probe | Observed result |
| --- | --- |
| History and outcomes | Original P1-P5 repeated: exact 2^200 amount, all four terminal outcomes plus Pending, restart/catch-up, abrupt kill, competing writer, native shallow fork and safe refusal after chain reset. |
| Positive window plus admission | Two extra blocks; visibility false/false/true at 0/1/2. A public block handler advanced checkpoint through empty blocks. Recovery window: 12 timestamp seconds in this fixture. |
| Duplicate delivery | Same event invoked twice; second call skipped projection. Different payload with the same identity was rejected. Explicit later-block redelivery after a committed event left event count unchanged. |
| Kill between journal and projection | Journal 0, escrow 0; checkpoint 15 remained before interrupted event block 16. Restart recovered 3 escrows/4 events; another same-build restart retained exactly 4 events. |
| RPC outage | Application data and health returned 503, then recovered. Native Ponder readiness remains an internal engine signal. |
| Admitted fork inside window | 80 reads over 10 seconds: 79 successful canonical-prefix responses, 1 unavailable. A Pending prefix was allowed only before the reported checkpoint included rejection. Final Rejected, orphan release absent. Eligible-to-common-ancestor distance was 3 timestamp seconds. |
| Fork beyond window | Prior eligible header was 30 timestamp seconds after release. Engine logged an unrecoverable reorg. 113 rounds over 60 seconds checked both data and health, always 503. Five-second restart sample: no HTTP service, hence no stale data exposed. |
| Explicit replay | Fresh validated schema yielded 3 escrows, 6 journal events, Rejected and no orphan release. |

The original unprotected/zero-window profiles intentionally still record native admission/readiness gaps and G4's stale Released response. They are negative controls, not failures of the selected checkpoint profile. Exit 0 does not turn them into passing production requirements.

Two earlier harness runs stopped on overly strict assertions, not observed partial writes or orphan responses: (1) requiring checkpoint to remain exactly 13 even though canonical empty blocks 14-15 could commit before event 16; (2) rejecting canonical Pending before a prefix included the replacement rejection. Assertions now validate checkpoint bounds and prefix consistency. Raw local evidence remains under the corresponding generated runtime directories; the final reproducible report is linked above.

## Database boundary and idempotency

`projection.ts` contains projection rules and a small ProjectionStore port without SQL/Ponder imports. `store.ts` implements it using only the current handler's context.db. The event adapter normalizes chain facts, then calls the projection. No HTTP write API, external queue or independent pg transaction is introduced.

One deployment is validated and isolated per schema. Event identity is transaction hash plus log index within that deployment. Existing identities must have identical block number/hash, escrow ID, event name and normalized argument payload; identical repeats do nothing, conflicts fail. Only a new journal event can change the projection; new terminal transitions require an existing Pending escrow. Primary keys and framework writer exclusion reinforce this invariant.

Ponder owns the transaction that includes journal/projection and its progress; the public block handler supplies the application-visible checkpoint. The failure test confirmed that checkpoint never included the interrupted event block. This is effectively-once application state for tested delivery/restart paths, not a distributed exactly-once promise. Canonical rollback can deliberately change an already projected outcome.

## Selected integration policy

- Keep two additional blocks for local admission. This is not consensus finality. Retain a positive recovery window; the fixture's 12 seconds is not a production safety recommendation. Start integration with the documented 180-second default and keep it explicit/configurable, subject to acceptance tests.
- Recover automatically inside the configured window using Ponder's rollback. Serve only a projection consistent with its reported canonical checkpoint; a canonical older prefix may be visible with progress/backlog metadata. Beyond the window or on an identity mismatch, block reads and require explicit validated replay.
- Read checkpoint and rows in one database snapshot, validate deployment identity and checkpoint against current RPC, and recheck before responding. RPC failure or an unverifiable checkpoint means 503. Do not equate native /ready or /health with application health.
- Ponder reserves native /health and /ready. The proof uses supported /observed/escrows and /observed/health routes. The final read API must expose the required public paths with the same guard; native endpoints stay internal. A small separate read API can use the existing pg dependency without becoming a writer.
- Projection/persistence ownership, configuration and checkpoint identity are explicit. No second broker, webhook ingress, generic repository framework, upgrade or pause work enters this scope.

## Remaining acceptance and limitations

Production integration must verify deployment/schema lifecycle, event actor validation and trace fields, complete numeric boundaries, required filters/time eligibility/pagination, public health, restart lifecycle and the suite in CI. Existing GitHub tracker text reflects the previously published decision and was not changed by this local proof. AC6-AC8 remain open for the final adapter despite the experimental evidence.

The controlled Anvil replacement is not a real network reorg or a throughput benchmark. The 10/60-second samples do not prove every possible timing; restart exposure was sampled five seconds after launch. RPC and PostgreSQL cannot form one atomic snapshot; a reorg after the last check remains possible. The trusted RPC, confirmation delay and recovery window must be documented. No testnet deployment or new commit/push was performed.
