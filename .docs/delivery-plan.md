# One-week delivery plan

Planning date: Tuesday, November 3, 2026. Candidate availability: 5-6 effective hours per day, including weekends. Candidate confirmed Foundry + TypeScript familiarity. This remains an estimate pending spike outcomes and integration evidence.

## Recommendation

Use Saturday, November 7 as the revised internal functional-core checkpoint and Monday, November 9 as the proposed submission date. Friday is November 6. No employer deadline was supplied; the candidate must reconcile this plan with any agreed deadline.

Friday submission is a stretch: November 4-6 provides only 15-18 hours, plus whatever remains on kickoff day. November 4-9 provides 30-36 hours, plus kickoff time. AI can accelerate drafting and review, but candidate understanding, integration, testing, and clean-run verification still consume time.

After PostgreSQL, infrastructure-first ordering and baseline CI, budget roughly 29-39 hours for mandatory work plus 3-5 hours of contingency: approximately 32-44 effective hours total. The prior 30-40 estimate assumed SQLite. These are planning ranges, not measured throughput or multiplied agent-hours. The high end exceeds the 30-36 hours available Nov 4-9 before counting kickoff work, so Monday is conditional, not guaranteed. No dashboard, transaction observer, broker, or new token policies this week.

Claude's original 25-36 estimate assumed the earlier stack. PostgreSQL/read-model work was previously allowed 2-4 additional hours. The foundation below reallocates one hour from startup/demo and 1-2 hours from that increment; it is not added again. Basic CI takes one hour from contingency. Creation-time filters and an extended invariant suite are deferred optional work. These are planning reallocations, not measured savings.

## Effort budget

| Work | Hours | Includes |
| --- | --- | --- |
| Source review, architecture discussion, bounded spikes | 2-3 | Close behavioral assumptions; verify/choose toolchain activation before coding. |
| Scaffold and Docker foundation | 2-3 | Reallocated setup time: pinned tools, Anvil/PostgreSQL, real positive/negative smoke checks and isolation. |
| Initial baseline CI | 1 | Same checks as local; taken from contingency, with a strict initial timebox. |
| Contract and tests | 6-8 | All paths, exact boundaries, token failures, access/reentrancy. |
| Indexer and database tests | 6-8 | Ordered processing, atomic cursor, replay/restart, reorg policy. |
| API and tests | 3-4 | Filters, pagination, derived time state, health. |
| Full startup/demo and reviewer documentation | 3-4 | Integrate later deployment/API and all terminal flows; setup partly completed in foundation. |
| Independent review and explanation rehearsal | 5-6 | Fix critical findings; candidate defends choices. |
| Remaining PostgreSQL/read-model increment | 1-2 | Remaining writer/snapshot integration; DB provisioning is already in foundation. |
| **Mandatory work subtotal** | **29-39** | Tests are included with their slices. |
| Contingency | 3-5 | One hour reassigned to baseline CI; remaining tooling/integration/recovery risk. |
| **Total planning range** | **32-44** | Optional work uses only genuine remaining capacity. |

## Calendar and gates

| Date | Target | Exit condition |
| --- | --- | --- |
| Tue Nov 3 | Planning and source review | Discuss architecture, scope, and desk-reviewed spike decisions. No implementation without a new instruction. |
| Wed Nov 4 | Review/publish planning; scaffold, local foundation and initial CI next | Issues and ownership recorded; when implementation is authorized, actual smoke/CI evidence before calling infrastructure ready. |
| Thu Nov 5 | Contract and event interface | Lifecycle/core tests; event signatures frozen early; independent adversarial cases. |
| Fri Nov 6 | Contract closeout and indexer | AC1-AC5 evidence and ordered durable event processing/restart core. |
| Sat Nov 7 | Functional core checkpoint | API, derived expiry, replay/restart and all lifecycle flows integrated; critical gaps resolved. |
| Sun Nov 8 | Feature freeze and submission rehearsal | Fresh startup succeeds; README and AI logs match behavior; candidate explanation rehearsed. |
| Mon Nov 9 | Buffer and delivery | Only fixes and final checks; share repository when authorized. |

The November 5 contract milestone is complete: C1-C10, 62 passing tests, independent review and observed green CI. Nov 6 closeout keeps the current contract unchanged and moves pause/upgrade alternatives to future [#8](https://github.com/dubzn/remitee-challenge/issues/8)/[#9](https://github.com/dubzn/remitee-challenge/issues/9), outside the submission gates. See [closeout evidence](outputs/codex/2026-11-06-contract-closeout.md). Indexer/API/integration remain pending. The subsequent Nov 6 Ponder PoC completed within its bounded spike and retained RPC polling; it did not complete the indexer block. See [executed decision](outputs/codex/2026-11-06-ponder-poc.md).

The functional-core checkpoint moves from Friday to Saturday; the submission target does not move. Do not start optional work after Saturday. If mandatory slices slip, remove all optional additions and report the specific acceptance risk; do not silently assume extra candidate hours.

## Scope cuts

Never cut access control, token safety, exact time rules, terminal immutability, mandatory tests, restart/idempotency, derived expiry, local startup, or the complete demo.

Drop testnet, webhooks/permit/fee support, gas tuning and extra tools first. An extended invariant suite (2-hour cap) and creation-time filters are optional after mandatory acceptance; adversarial/access/time tests remain mandatory. Basic CI is now baseline, not an optional cut. PostgreSQL and Docker local execution are candidate choices; Compose contains Anvil and PostgreSQL, not a production platform. No broker, separate application services, dashboard, failed-transaction indexing or generalized rollback. Validate the Docker daemon early. If initial CI exceeds its one-hour timebox, diagnose/re-plan it rather than replacing it with more tooling or claiming success.

If the plan exceeds the one-week cap, stop adding scope, identify the blocking mandatory criterion, and revise the estimate with the candidate. Do not quietly extend the deadline or label an incomplete submission complete.

Follow-up on Nov 4: the 32-44 hour envelope does not include a gateway/pauser, parallel RPC fetcher, or durable provisional transaction view. Confirmation waiting is already in scope; a local delay-2 demo must explicitly mine additional blocks. Any selected pause policy changes authority/acceptance and needs an incremental estimate before implementation.

## Submission gate

- Every SDD acceptance criterion has test or observed evidence; no unresolved critical contract/indexer defect.
- Fresh local run starts the node, deploys, initializes persistence, and serves the API through one documented command.
- Demo creates separate escrows for release, rejection, sender cancellation, and expiry recovery, and verifies the resulting API records.
- README covers setup, tests, HTTP examples, assumptions, asset limits, confirmation/reorg policy, and future work.
- Repository access is confirmed; commits are focused; temporary data, generated artifacts, secrets, and local credentials are excluded.
- AI prompts and substantive outputs are retained, with adopted/rejected advice explained. Candidate can defend the result.

The candidate authorized publishing planning, creating issues, and subsequently implementing local infrastructure/CI on Nov 4. See [foundation commands/evidence](local-development.md). The candidate subsequently authorized the contract core on Nov 5; it is implemented and verified. Full business acceptance still requires the later indexer/API/integration slices.
