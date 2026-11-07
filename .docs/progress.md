# Delivery progress

Updated: November 7, 2026. S3 is implemented and [locally verified/reviewed](outputs/codex/2026-11-07-read-api-implementation.md); publication and its remote CI remain pending. The [previous observed CI](https://github.com/dubzn/remitee-challenge/actions/runs/42248952896) belongs to S2/6403057. This page summarizes status; [SDD](sdd/escrow.md) owns acceptance and [delivery plan](delivery-plan.md) owns dates/scope cuts.

Local S3 implementation commit: `9ee0c36`; no push was requested in this slice.

## Current status

| Block | Status | Evidence / remaining work |
| --- | --- | --- |
| S0: scope and architecture | Defined | Escrow rules, contract interface, token assumptions, indexing choice and API semantics recorded in the [SDD](sdd/escrow.md). Candidate explanation rehearsal remains part of S5. |
| I0: local infrastructure | Complete | Pinned Docker/Anvil/PostgreSQL/toolchain, isolated smoke and failure checks; [foundation evidence](outputs/codex/2026-11-04-infrastructure.md). GitHub #1 closed. |
| I0: baseline CI | Complete | TypeScript/foundation smoke and contract format/build/62 tests/ABI checks. [Latest published run passed](https://github.com/dubzn/remitee-challenge/actions/runs/42248952896). GitHub #2 closed. The application Ponder job also passed; the archived PoC stays outside CI. |
| S1: escrow contracts | Complete | Five actions/events, four resolution paths, exact time boundaries, access/token/reentrancy tests; AC1-AC5 and C1-C10 have [implementation evidence](outputs/codex/2026-11-05-contract-implementation.md). GitHub #3 closed. |
| Indexer selection spike | Complete | Ponder 0.18.5 selected. Real Anvil/PostgreSQL probes covered duplicates/conflicts, crash/restart, two-block admission, empty blocks, RPC loss, forks and replay. [Decision and evidence](outputs/codex/2026-11-06-ponder-decision.md). |
| S2: application indexer | Complete | Deployment descriptor, schema/adapter, trace fields and recovery integrated. 16 rule tests, 13 application observations and successful remote CI. [Evidence](outputs/codex/2026-11-06-indexer-integration.md). GitHub #4 closed with history preserved. |
| S3: read API | Implemented and locally verified | AC9-AC10 have [18 integrated observations and Opus/xhigh review/fixes](outputs/codex/2026-11-07-read-api-implementation.md). Detail/list/health, SQL filters/pages, traces/time fields and startup guards are implemented. #5 remains open pending publication/CI closure. |
| API documentation | Delivered locally; CI configured | [#11](https://github.com/dubzn/remitee-challenge/issues/11): canonical OpenAPI/raw serving, 14 example uses and actual HTTP response/schema checks pass. Seven API unit tests and existing CI integration; remote execution remains pending. Swagger UI is optional and absent. |
| Contract reference docs | Planned | [#12](https://github.com/dubzn/remitee-challenge/issues/12): NatSpec + forge doc before the S4 fresh run; functional S1 remains complete. |
| S4: full startup and demo | Planned | One command must include deployment, indexer and API, then demonstrate all four outcomes from clean state; AC11 open. GitHub #6 open. Existing infra startup covers only the foundation. |
| S5: final review and delivery | In progress / final gate pending | Specs, reviews and AI outputs are recorded. Complete README/HTTP examples, fresh-run checks, final acceptance and candidate rehearsal; AC12 open. GitHub #7 open. |

GitHub issue states #1-#7 were checked on November 6. [Issues](https://github.com/dubzn/remitee-challenge/issues) provide task tracking, #4 retains the polling proposal and appends the Ponder decision change without deleting history. Pause and upgrades (#8/#9) remain future improvements, outside the required deliverable.

## Immediate next slice: publication and S4

1. Publish the local S3 commits when requested, observe their CI result and close #5/#11 with that evidence. Do not reuse the old S2 run as proof.
2. Complete #12 NatSpec/forge doc before the new clean deployment, then full startup/demo integration (S4, #6) with all four outcomes.
3. Complete final review, documentation and candidate rehearsal (S5, #7). Swagger UI remains optional.

S2/AC6-AC8 are closed with local and observed CI evidence. Do not reopen engine selection or add a wallet UI. See [runtime commands](indexer-runtime.md) and the [Foundry testnet runbook](testnet-wallet.md).

November 6 stakeholder follow-up: internal-process consumers and expected network delay are acceptable; the candidate retains first-successful-resolution cancellation semantics. [Recorded clarification](references.md#stakeholder-clarification-recorded-november-6) and [configuration verification](outputs/codex/2026-11-06-stakeholder-feedback.md). CONFIRMATION_DELAY was already environment-configurable; 16 existing tests and an isolated 0/2/6 transport probe passed. AuthN/AuthZ stays future work in #14; no new runtime feature or S3 gate was added.

## Schedule checkpoint

The November 4 foundation, November 5 contracts and November 6 indexer milestones are complete. On November 7 the S3 API passed local acceptance and review; its remote publication/CI and the S4 integration/demo still remain.

The planned functional checkpoint remains Saturday, November 7; Sunday, November 8 is freeze/rehearsal; Monday, November 9 is the conditional delivery target. These are planning targets, not measured remaining work or a guaranteed employer deadline. Resolve S2/integration gaps before calling the functional checkpoint complete.

Requested documentation: [tooling and second-opinion disposition](outputs/codex/2026-11-06-documentation-tooling.md). The subsequent candidate follow-up prioritizes OpenAPI and consistency checks; Swagger UI is optional final polish. Issue #11 retains the original proposal and appends this clarification. The earlier provisional 6-9 hours included UI and is not a revised mandatory budget; reconcile overlap with existing documentation hours.

## Future improvements outside this delivery

The [read API guide](read-api-design.md) consolidates the current design and extension constraints. [#13: caching](https://github.com/dubzn/remitee-challenge/issues/13) and [#14: AuthN/AuthZ middleware](https://github.com/dubzn/remitee-challenge/issues/14) are backlog only. S3 uses anonymous access and direct PostgreSQL reads; no cache or authentication/authorization implementation, placeholder or additional delivery gate is added.

The candidate follow-up also records [token/freeze limits](token-support.md) and [timing alternatives](contract-design.md#timing-configuration-current-policy-and-future-alternatives). Constants remain 2h/7d. No new contract function, asset-admission restriction or prevention/monitoring implementation is added; existing generic failure tests are not issuer-specific freeze coverage.
