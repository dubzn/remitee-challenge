# Delivery progress

Updated: November 6, 2026. Verified implementation commit: `6403057`; [complete successful CI](https://github.com/dubzn/remitee-challenge/actions/runs/42248952896). This is the short status view; the [SDD](sdd/escrow.md) owns acceptance criteria and the [delivery plan](delivery-plan.md) owns dates and scope cuts. Update this page when a slice changes status, with links to observed evidence. Do not use PoC completion as final application acceptance.

## Current status

| Block | Status | Evidence / remaining work |
| --- | --- | --- |
| S0: scope and architecture | Defined | Escrow rules, contract interface, token assumptions, indexing choice and API semantics recorded in the [SDD](sdd/escrow.md). Candidate explanation rehearsal remains part of S5. |
| I0: local infrastructure | Complete | Pinned Docker/Anvil/PostgreSQL/toolchain, isolated smoke and failure checks; [foundation evidence](outputs/codex/2026-11-04-infrastructure.md). GitHub #1 closed. |
| I0: baseline CI | Complete | TypeScript/foundation smoke and contract format/build/62 tests/ABI checks. [Latest published run passed](https://github.com/dubzn/remitee-challenge/actions/runs/42248952896). GitHub #2 closed. The application Ponder job also passed; the archived PoC stays outside CI. |
| S1: escrow contracts | Complete | Five actions/events, four resolution paths, exact time boundaries, access/token/reentrancy tests; AC1-AC5 and C1-C10 have [implementation evidence](outputs/codex/2026-11-05-contract-implementation.md). GitHub #3 closed. |
| Indexer selection spike | Complete | Ponder 0.18.5 selected. Real Anvil/PostgreSQL probes covered duplicates/conflicts, crash/restart, two-block admission, empty blocks, RPC loss, forks and replay. [Decision and evidence](outputs/codex/2026-11-06-ponder-decision.md). |
| S2: application indexer | Complete | Deployment descriptor, schema/adapter, trace fields and recovery integrated. 16 rule tests, 13 application observations and successful remote CI. [Evidence](outputs/codex/2026-11-06-indexer-integration.md). GitHub #4 closed with history preserved. |
| S3: read API | HTTP contract reviewed; implementation next | [OpenAPI and guide](api/README.md), with [Opus/xhigh review disposition](outputs/codex/2026-11-06-read-api-spec.md). Actual detail/list/health, filters/pagination and time-derived expiry remain pending; AC9-AC10 and #5 stay open. Internal observation endpoints do not complete this slice. |
| API documentation | Draft validated locally | [#11](https://github.com/dubzn/remitee-challenge/issues/11): OpenAPI 3.1 has 14 validated response-example uses. Serving it, actual HTTP/schema checks and CI remain pending; Swagger UI is optional polish. |
| Contract reference docs | Planned | [#12](https://github.com/dubzn/remitee-challenge/issues/12): NatSpec + forge doc before the S4 fresh run; functional S1 remains complete. |
| S4: full startup and demo | Planned | One command must include deployment, indexer and API, then demonstrate all four outcomes from clean state; AC11 open. GitHub #6 open. Existing infra startup covers only the foundation. |
| S5: final review and delivery | In progress / final gate pending | Specs, reviews and AI outputs are recorded. Complete README/HTTP examples, fresh-run checks, final acceptance and candidate rehearsal; AC12 open. GitHub #7 open. |

GitHub issue states #1-#7 were checked on November 6. [Issues](https://github.com/dubzn/remitee-challenge/issues) provide task tracking, #4 retains the polling proposal and appends the Ponder decision change without deleting history. Pause and upgrades (#8/#9) remain future improvements, outside the required deliverable.

## Immediate next slice: S3

1. Implement the [reviewed HTTP contract](api/README.md): native Node consumer listener sharing the launcher's startup context with Ponder, required detail/list/health, bounded SQL filters/pagination, traces and derived time fields (AC9-AC10, #5). Reuse S2 snapshot/canonical guards and check real responses against OpenAPI.
2. Complete #11 response/example checks and #12 NatSpec/forge doc before the fresh run. Swagger UI is optional if capacity remains. Complete startup/demo integration (S4, #6) with all four outcomes.
3. Complete final review, reviewer documentation and candidate rehearsal (S5, #7).

S2/AC6-AC8 are closed with local and observed CI evidence. Do not reopen engine selection or add a wallet UI. See [runtime commands](indexer-runtime.md) and the [Foundry testnet runbook](testnet-wallet.md).

November 6 stakeholder follow-up: internal-process consumers and expected network delay are acceptable; the candidate retains first-successful-resolution cancellation semantics. [Recorded clarification](references.md#stakeholder-clarification-recorded-november-6) and [configuration verification](outputs/codex/2026-11-06-stakeholder-feedback.md). CONFIRMATION_DELAY was already environment-configurable; 16 existing tests and an isolated 0/2/6 transport probe passed. AuthN/AuthZ stays future work in #14; no new runtime feature or S3 gate was added.

## Schedule checkpoint

The November 4 foundation and November 5 contract milestones are complete. The November 6 indexer is complete with local and observed remote CI evidence. The next block is the S3 API.

The planned functional checkpoint remains Saturday, November 7; Sunday, November 8 is freeze/rehearsal; Monday, November 9 is the conditional delivery target. These are planning targets, not measured remaining work or a guaranteed employer deadline. Resolve S2/integration gaps before calling the functional checkpoint complete.

Requested documentation: [tooling and second-opinion disposition](outputs/codex/2026-11-06-documentation-tooling.md). The subsequent candidate follow-up prioritizes OpenAPI and consistency checks; Swagger UI is optional final polish. Issue #11 retains the original proposal and appends this clarification. The earlier provisional 6-9 hours included UI and is not a revised mandatory budget; reconcile overlap with existing documentation hours.

## Future improvements outside this delivery

The [read API guide](read-api-design.md) consolidates the current design and extension constraints. [#13: caching](https://github.com/dubzn/remitee-challenge/issues/13) and [#14: AuthN/AuthZ middleware](https://github.com/dubzn/remitee-challenge/issues/14) are backlog only. S3 uses anonymous access and direct PostgreSQL reads; no cache or authentication/authorization implementation, placeholder or additional delivery gate is added.

The candidate follow-up also records [token/freeze limits](token-support.md) and [timing alternatives](contract-design.md#timing-configuration-current-policy-and-future-alternatives). Constants remain 2h/7d. No new contract function, asset-admission restriction or prevention/monitoring implementation is added; existing generic failure tests are not issuer-specific freeze coverage.
