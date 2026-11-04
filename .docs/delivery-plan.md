# One-week delivery plan

Planning date: Tuesday, November 3, 2026. Candidate availability: 5-6 effective hours per day, including weekends. Candidate confirmed Foundry + TypeScript familiarity. This remains an estimate pending spike outcomes and integration evidence.

## Recommendation

Use Friday, November 6 as an internal functional-core checkpoint and Monday, November 9 as the proposed submission date. November 7 is Saturday. No employer deadline was supplied; the candidate must reconcile this plan with any agreed deadline.

Friday submission is a stretch: November 4-6 provides only 15-18 hours, plus whatever remains on kickoff day. November 4-9 provides 30-36 hours, plus kickoff time. AI can accelerate drafting and review, but candidate understanding, integration, testing, and clean-run verification still consume time.

Budget roughly 26-34 hours for the mandatory deliverable, plus 4-6 hours of contingency: approximately 30-40 effective hours total. These are planning ranges, not measured implementation throughput or multiplied agent-hours. Monday is safer but not guaranteed; cap scope rather than treating the weekend as unlimited capacity.

Claude's independent estimate is approximately 25-36 hours including contingency, assuming familiar tooling and a simplified indexer. Codex retains 30-40 hours as the conservative planning envelope, including planning/review and recovery verification. Both recommend Monday. Do not add the estimates together.

## Effort budget

| Work | Hours | Includes |
| --- | --- | --- |
| Source review, architecture discussion, bounded spikes | 2-3 | Close behavioral assumptions; verify/choose toolchain activation before coding. |
| Contract and tests | 6-8 | All paths, exact boundaries, token failures, access/reentrancy. |
| Indexer and database tests | 6-8 | Ordered processing, atomic cursor, replay/restart, reorg policy. |
| API and tests | 3-4 | Filters, pagination, derived time state, health. |
| Startup/demo and reviewer documentation | 4-5 | Clean setup, all terminal flows, HTTP examples, AI records. |
| Independent review and explanation rehearsal | 5-6 | Fix critical findings; candidate defends choices. |
| **Mandatory work subtotal** | **26-34** | Tests are included with their slices. |
| Contingency | 4-6 | Tooling friction, integration defects, recovery corner cases. |
| **Total planning range** | **30-40** | Optional work uses only genuine remaining capacity. |

## Calendar and gates

| Date | Target | Exit condition |
| --- | --- | --- |
| Tue Nov 3 | Planning and source review | Discuss architecture, scope, and desk-reviewed spike decisions. No implementation without a new instruction. |
| Wed Nov 4 | Contract slice | Lifecycle, access, transfer failures, exact boundaries covered. |
| Thu Nov 5 | Contract closeout and indexer | Event replay and atomic checkpoint work against real DB. |
| Fri Nov 6 | Functional core checkpoint | All lifecycle outcomes reach the API; restart works; major gaps identified. |
| Sat Nov 7 | Integration and failure behavior | Derived expiry, duplicate replay, recovery policy, health, and demo verified. |
| Sun Nov 8 | Feature freeze and submission rehearsal | Fresh startup succeeds; README and AI logs match behavior; candidate explanation rehearsed. |
| Mon Nov 9 | Buffer and delivery | Only fixes and final checks; share repository when authorized. |

Do not begin a new optional feature after Saturday. If the mandatory core is incomplete on Friday, use the weekend to finish it and remove every optional addition.

## Scope cuts

Never cut access control, token safety, exact time rules, terminal immutability, mandatory tests, restart/idempotency, derived expiry, local startup, or the complete demo.

Cut in this order: testnet deployment; webhooks/permit/fee support; gas tuning and extra tools; elaborate CI. At most two optional additions: a compact Foundry invariant/fuzz suite (2-hour cap) and basic CI (1-hour cap), after mandatory criteria are stable. Drop either if its timebox is exceeded; do not substitute more tooling. Do not introduce PostgreSQL, queues, separate services, Docker, or generalized reorg rollback merely to mirror the JD. The one-command baseline uses local tooling.

If the plan exceeds the one-week cap, stop adding scope, identify the blocking mandatory criterion, and revise the estimate with the candidate. Do not quietly extend the deadline or label an incomplete submission complete.

## Submission gate

- Every SDD acceptance criterion has test or observed evidence; no unresolved critical contract/indexer defect.
- Fresh local run starts the node, deploys, initializes persistence, and serves the API through one documented command.
- Demo creates separate escrows for release, rejection, sender cancellation, and expiry recovery, and verifies the resulting API records.
- README covers setup, tests, HTTP examples, assumptions, asset limits, confirmation/reorg policy, and future work.
- Repository access is confirmed; commits are focused; temporary data, generated artifacts, secrets, and local credentials are excluded.
- AI prompts and substantive outputs are retained, with adopted/rejected advice explained. Candidate can defend the result.

Publishing, pushing, and implementation are future actions. None has been performed by this planning task.
