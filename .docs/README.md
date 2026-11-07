# Remitee challenge planning

Status: infrastructure/contracts/indexer have local and observed CI evidence; S3 API is implemented and locally verified, with publication/remote CI pending. Full startup/demo remains S4. Updated: 2026-11-07. All authored documentation is in English.

The intended outcome is one reviewable submission within one week. S3 now has [implementation, local acceptance and review](outputs/codex/2026-11-07-read-api-implementation.md); NatSpec, full startup/demo and rehearsal remain. Start with [local commands](local-development.md). The November 5 contract milestone is [closed](outputs/codex/2026-11-06-contract-closeout.md); pause/upgrades stay future work.

## Start here

[Current progress and next slice](progress.md): block status, evidence and remaining work.

[Read API guide](read-api-design.md): recommended reading, planned endpoints and the cache/AuthN/AuthZ future backlog. Start here for S3.

[Implemented HTTP contract and examples](api/README.md): canonical OpenAPI, runnable commands, exact public types/errors and local HTTP evidence.

1. [Source review and role alignment](references.md): what the challenge actually requires and how the JD informs quality.
2. [Escrow specification and architecture](sdd/escrow.md): the proposed behavioral contract, boundaries, acceptance criteria, and work slices.
3. [Delivery plan](delivery-plan.md): effort range, calendar, cut rules, and submission gate.
4. [Spikes](spikes/README.md): bounded questions to resolve before implementation.
5. [Codex analysis](outputs/codex/2026-11-03-analysis.md), [Claude review](outputs/claude/2026-11-03-review.md), and [review disposition](outputs/codex/2026-11-03-review-disposition.md): separate contributions, retained prompt outputs, and the decisions taken after independent review.
6. [Architecture feedback and worked examples](design-review.md): candidate questions, PostgreSQL, reuse assessment, crash/reorg examples, and a proposed API response. See [feedback decisions](outputs/codex/2026-11-03-feedback-decisions.md) for the second review's disposition. Earlier outputs retain the SQLite proposal as historical evidence; the current SDD selects PostgreSQL.
7. [Confirmations, capacity, and emergency pause](safety-review.md): accepted observation/token boundaries, confirmation timeline, and the pause alternatives now tracked outside the deliverable. See [safety decisions](outputs/codex/2026-11-04-safety-decisions.md) for Codex's assessment of the new Claude review.
8. [Contract flow diagrams](contract-flows.md): lifecycle, creation/funding sequence, token-exit checks, and expiry without a transaction. Start here to understand who actually triggers each payout.
9. [Infrastructure-first block and ownership](infrastructure-plan.md): Docker foundation, baseline CI, seven linked GitHub issues and division between Codex and Claude before contracts. See the [Opus/xhigh pre-commit review disposition](outputs/codex/2026-11-04-preflight-decisions.md) for corrections and remaining decisions.
10. [Contract core interface and storage](contract-design.md): approved and implemented ABI/types/state, mapped SDD completion checks and verification evidence. Pause/upgrade alternatives are future issues [#8](https://github.com/dubzn/remitee-challenge/issues/8)/[#9](https://github.com/dubzn/remitee-challenge/issues/9).

11. [Indexer design and provider options](indexer-design.md): **Ponder selected** after the [concrete recovery/idempotency proof](outputs/codex/2026-11-06-ponder-decision.md). Production integration remains pending.
12. [PostgreSQL models](postgres-models.md): relationship diagram, column types, keys, indexes, atomic writes and schema/replay policy for the proposed three tables.

13. [Integrated Ponder runtime](indexer-runtime.md): commands, configuration, recovery and verification.
14. [CLI wallets/testnet](testnet-wallet.md): two accounts, Foundry signing boundary and time limitations.

15. [Documentation tooling and review](outputs/codex/2026-11-06-documentation-tooling.md): OpenAPI/Swagger UI and NatSpec/forge doc, issues #11/#12 and the Opus/xhigh disposition.

16. [Token compatibility and freeze limits](token-support.md): supported semantics, issuer pause/blacklist scenarios, conditional recovery and current test coverage. [Timing alternatives](contract-design.md#timing-configuration-current-policy-and-future-alternatives) distinguish current constants, permitted deployment immutables and future per-escrow terms.

## Working agreement

- The candidate owns decisions and must be able to explain every submitted part.
- Architecture choices are proposals until discussed with the candidate. Planning does not authorize implementation.
- Source requirements, proposed decisions, and unresolved questions are labeled separately.
- Keep one canonical SDD; use spikes only for questions with a clear decision and time limit.
- Save future substantive AI prompts and outputs under `outputs/<agent>/`, in English, with the resulting decision or rejection recorded.
- Keep the eventual submission focused on the challenge. The broader job description does not expand its functional scope.

## Current recommendation

After front-loading infrastructure and CI, aim for a functional core on Saturday, November 7, and submission on Monday, November 9, 2026. This is a conditional planning estimate, not an employer deadline; verify any externally agreed deadline separately.
