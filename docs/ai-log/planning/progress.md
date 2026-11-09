# Delivery progress

Updated: November 9, 2026. S3 has published [remote CI evidence](https://github.com/dubzn/remitee-challenge/actions/runs/42340576160); the [November 8 documentation closeout](outputs/codex/2026-11-08-documentation-closeout.md) remains separate. S4 [complete Docker startup/demo](docker-demo.md) has [local evidence and Opus/xhigh dispositions](outputs/codex/2026-11-09-docker-startup.md): 30 post-review checks passed across delays 0/2/6. New Docker CI is configured, not observed remotely. [SDD](sdd/escrow.md) owns acceptance; [delivery plan](delivery-plan.md) owns dates/scope cuts.

Published S3 implementation: `9ee0c36`; remote CI head: `80f1367`. New NatSpec/reference generation is locally verified and reviewed with Opus/xhigh, with fixes/check reruns recorded. Its new CI step is not yet observed remotely.

## Current status

| Block | Status | Evidence / remaining work |
| --- | --- | --- |
| S0: scope and architecture | Defined | Escrow rules, contract interface, token assumptions, indexing choice and API semantics recorded in the [SDD](sdd/escrow.md). Candidate explanation rehearsal remains part of S5. |
| I0: local infrastructure | Complete | Pinned Docker/Anvil/PostgreSQL/toolchain, isolated smoke and failure checks; [foundation evidence](outputs/codex/2026-11-04-infrastructure.md). GitHub #1 closed. |
| I0: baseline CI | Complete | TypeScript/foundation smoke and contract format/build/62 tests/ABI checks. [Published S3 run passed](https://github.com/dubzn/remitee-challenge/actions/runs/42340576160), including application Ponder/public HTTP acceptance. GitHub #2 closed; archived PoC stays outside CI. The newly added contract-doc step has local evidence only. |
| S1: escrow contracts | Complete | Five actions/events, four resolution paths, exact time boundaries, access/token/reentrancy tests; AC1-AC5 and C1-C10 have [implementation evidence](outputs/codex/2026-11-05-contract-implementation.md). GitHub #3 closed. |
| Indexer selection spike | Complete | Ponder 0.18.5 selected. Real Anvil/PostgreSQL probes covered duplicates/conflicts, crash/restart, two-block admission, empty blocks, RPC loss, forks and replay. [Decision and evidence](outputs/codex/2026-11-06-ponder-decision.md). |
| S2: application indexer | Complete | Deployment descriptor, schema/adapter, trace fields and recovery integrated. 16 rule tests, 13 application observations and successful remote CI. [Evidence](outputs/codex/2026-11-06-indexer-integration.md). GitHub #4 closed with history preserved. |
| S3: read API | Complete | AC9-AC10 have [18 integrated observations and Opus/xhigh review/fixes](outputs/codex/2026-11-07-read-api-implementation.md), plus published CI on 80f1367. Detail/list/health, SQL filters/pages, traces/time fields and startup guards are implemented. GitHub #5 is tracking; no issue mutation is claimed here. |
| API documentation | Complete | [#11](https://github.com/dubzn/remitee-challenge/issues/11): canonical OpenAPI/raw serving, 14 example uses, 7 API unit tests and actual HTTP response/schema checks passed locally and in published CI. Swagger UI is optional and absent. |
| Contract reference docs | Complete locally; reviewed | [#12](https://github.com/dubzn/remitee-challenge/issues/12): [NatSpec + pinned forge doc](../contracts/README.md), inheritance/render/link checks, 62 tests and all 18 actual indexer/API observations against a new build passed. Opus/xhigh fixes and final twice-identical generation recorded. ABI/executable runtime unchanged; metadata differs as expected. New CI step awaits publication. |
| S4: full startup and demo | Complete locally; reviewed | [Docker-only reviewer path](docker-demo.md) without host Node/npm/Foundry. Ten post-review checks passed at each delay 0/2/6: startup, two demos, all outcomes/getters/per-action payouts, recoverable expiry, traces, restart and exact refusals. Host regression 18 observations/foundation passed again. Normal localhost:3000 setup is running. New CI awaits publication/observation; #6 remains tracking, no issue mutation claimed. |
| S5: final review and delivery | In progress / final gate pending | Specs, reviews and AI outputs are recorded. Complete README/HTTP examples, fresh-run checks, final acceptance and candidate rehearsal; AC12 open. GitHub #7 open. |

GitHub issue states #1-#7 were checked on November 6. [Issues](https://github.com/dubzn/remitee-challenge/issues) provide task tracking, #4 retains the polling proposal and appends the Ponder decision change without deleting history. Pause and upgrades (#8/#9) remain future improvements, outside the required deliverable.

## Immediate next slice: publication/new CI and S5

1. S4 implementation/review/local acceptance are complete. Prepare/publish the new changes when requested and observe their CI; previous green S3 runs do not establish this. GitHub issue closure remains separate from repository updates.
2. S5 clean-run/candidate rehearsal and final acceptance. The documented Docker commands have actual execution, but no candidate explanation/interview rehearsal is claimed.
3. Complete final review, documentation and candidate rehearsal (S5, #7). Swagger UI remains optional.

S2/AC6-AC8 are closed with local and observed CI evidence. Do not reopen engine selection or add a wallet UI. See [runtime commands](indexer-runtime.md) and the [Foundry testnet runbook](testnet-wallet.md).

November 6 stakeholder follow-up: internal-process consumers and expected network delay are acceptable; the candidate retains first-successful-resolution cancellation semantics. [Recorded clarification](references.md#stakeholder-clarification-recorded-november-6) and [configuration verification](outputs/codex/2026-11-06-stakeholder-feedback.md). CONFIRMATION_DELAY was already environment-configurable; 16 existing tests and an isolated 0/2/6 transport probe passed. AuthN/AuthZ stays future work in #14; no new runtime feature or S3 gate was added.

## Schedule checkpoint

The November 4 foundation, November 5 contracts and November 6 indexer milestones are complete. S3 published CI is verified; contract reference documentation has November 8 local evidence. November 9 closes S4 locally after review corrections and full reruns. Publication/new CI and S5 final rehearsal remain.

The original functional checkpoint was Saturday, November 7 and freeze/rehearsal Sunday, November 8. Monday, November 9 now absorbs full Docker integration closeout. Submission remains conditional on review, new CI and S5 candidate rehearsal; the original buffer has been consumed. No employer deadline or extra candidate capacity is inferred.

Requested documentation: [tooling and second-opinion disposition](outputs/codex/2026-11-06-documentation-tooling.md). The subsequent candidate follow-up prioritizes OpenAPI and consistency checks; Swagger UI is optional final polish. Issue #11 retains the original proposal and appends this clarification. The earlier provisional 6-9 hours included UI and is not a revised mandatory budget; reconcile overlap with existing documentation hours.

## Future improvements outside this delivery

The [read API guide](read-api-design.md) consolidates the current design and extension constraints. [#13: caching](https://github.com/dubzn/remitee-challenge/issues/13) and [#14: AuthN/AuthZ middleware](https://github.com/dubzn/remitee-challenge/issues/14) are backlog only. S3 uses anonymous access and direct PostgreSQL reads; no cache or authentication/authorization implementation, placeholder or additional delivery gate is added.

The candidate follow-up also records [token/freeze limits](token-support.md) and [timing alternatives](contract-design.md#timing-configuration-current-policy-and-future-alternatives). Constants remain 2h/7d. No new contract function, asset-admission restriction or prevention/monitoring implementation is added; existing generic failure tests are not issuer-specific freeze coverage.
