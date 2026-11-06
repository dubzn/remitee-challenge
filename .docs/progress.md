# Delivery progress

Updated: November 6, 2026. Latest published commit: `ae3e35d`. This is the short status view; the [SDD](sdd/escrow.md) owns acceptance criteria and the [delivery plan](delivery-plan.md) owns dates and scope cuts. Update this page when a slice changes status, with links to observed evidence. Do not use PoC completion as final application acceptance.

## Current status

| Block | Status | Evidence / remaining work |
| --- | --- | --- |
| S0: scope and architecture | Defined | Escrow rules, contract interface, token assumptions, indexing choice and API semantics recorded in the [SDD](sdd/escrow.md). Candidate explanation rehearsal remains part of S5. |
| I0: local infrastructure | Complete | Pinned Docker/Anvil/PostgreSQL/toolchain, isolated smoke and failure checks; [foundation evidence](outputs/codex/2026-11-04-infrastructure.md). GitHub #1 closed. |
| I0: baseline CI | Complete | TypeScript/foundation smoke and contract format/build/62 tests/ABI checks. [Latest published run passed](https://github.com/dubzn/remitee-challenge/actions/runs/42237201244). GitHub #2 closed. The Ponder PoC is not in CI yet. |
| S1: escrow contracts | Complete | Five actions/events, four resolution paths, exact time boundaries, access/token/reentrancy tests; AC1-AC5 and C1-C10 have [implementation evidence](outputs/codex/2026-11-05-contract-implementation.md). GitHub #3 closed. |
| Indexer selection spike | Complete | Ponder 0.18.5 selected. Real Anvil/PostgreSQL probes covered duplicates/conflicts, crash/restart, two-block admission, empty blocks, RPC loss, forks and replay. [Decision and evidence](outputs/codex/2026-11-06-ponder-decision.md). |
| S2: application indexer | Implemented locally; remote CI pending | Deployment descriptor, schema/adapter, trace fields and recovery integrated. 16 rule tests and 13 real integration observations. [Evidence](outputs/codex/2026-11-06-indexer-integration.md). GitHub #4 stays open until observed CI. |
| S3: read API | Planned | Required detail/list/health, filters/pagination, trace fields and time-derived expiry; AC9-AC10 remain open. GitHub #5 open. Experimental endpoints do not complete this slice. |
| S4: full startup and demo | Planned | One command must include deployment, indexer and API, then demonstrate all four outcomes from clean state; AC11 open. GitHub #6 open. Existing infra startup covers only the foundation. |
| S5: final review and delivery | In progress / final gate pending | Specs, reviews and AI outputs are recorded. Complete README/HTTP examples, fresh-run checks, final acceptance and candidate rehearsal; AC12 open. GitHub #7 open. |

GitHub issue states #1-#7 were checked on November 6. [Issues](https://github.com/dubzn/remitee-challenge/issues) provide task tracking, #4 retains the polling proposal and appends the Ponder decision change without deleting history. Pause and upgrades (#8/#9) remain future improvements, outside the required deliverable.

## Immediate next slice: close S2 CI and start S3

1. Publish the integration and observe the new indexer acceptance job. Close I5/AC6-AC8 and #4 only with actual evidence for the final adapter.
2. Implement S3: public detail/list/health, filters/pagination, transaction trace and derived time eligibility/expiry.
3. Complete startup/demo integration (S4), then final review and rehearsal (S5).

Do not reopen engine selection or add a wallet UI. See [runtime commands](indexer-runtime.md) and the [Foundry testnet runbook](testnet-wallet.md).

## Schedule checkpoint

The November 4 foundation and November 5 contract milestones are complete. The November 6 indexer is implemented and verified locally; observed remote CI is still needed for formal closeout.

The planned functional checkpoint remains Saturday, November 7; Sunday, November 8 is freeze/rehearsal; Monday, November 9 is the conditional delivery target. These are planning targets, not measured remaining work or a guaranteed employer deadline. Resolve S2/integration gaps before calling the functional checkpoint complete.
