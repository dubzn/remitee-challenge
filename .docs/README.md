# Remitee challenge planning

Status: infrastructure implementation authorized; business specification remains under discussion. Updated: 2026-11-04. All authored documentation is in English.

The intended outcome is one reviewable submission within one week. The candidate authorized local infrastructure and CI on Nov 4. Escrow, indexer and API implementation remain later slices. Start with [local commands and verification](local-development.md).

## Start here

1. [Source review and role alignment](references.md): what the challenge actually requires and how the JD informs quality.
2. [Escrow specification and architecture](sdd/escrow.md): the proposed behavioral contract, boundaries, acceptance criteria, and work slices.
3. [Delivery plan](delivery-plan.md): effort range, calendar, cut rules, and submission gate.
4. [Spikes](spikes/README.md): bounded questions to resolve before implementation.
5. [Codex analysis](outputs/codex/2026-11-03-analysis.md), [Claude review](outputs/claude/2026-11-03-review.md), and [review disposition](outputs/codex/2026-11-03-review-disposition.md): separate contributions, retained prompt outputs, and the decisions taken after independent review.
6. [Architecture feedback and worked examples](design-review.md): candidate questions, PostgreSQL, reuse assessment, crash/reorg examples, and a proposed API response. See [feedback decisions](outputs/codex/2026-11-03-feedback-decisions.md) for the second review's disposition. Earlier outputs retain the SQLite proposal as historical evidence; the current SDD selects PostgreSQL.
7. [Confirmations, capacity, and emergency pause](safety-review.md): accepted observation/token boundaries, confirmation timeline, and the pause policy still under discussion. See [safety decisions](outputs/codex/2026-11-04-safety-decisions.md) for Codex's assessment of the new Claude review.
8. [Contract flow diagrams](contract-flows.md): lifecycle, creation/funding sequence, token-exit checks, and expiry without a transaction. Start here to understand who actually triggers each payout.
9. [Infrastructure-first block and ownership](infrastructure-plan.md): Docker foundation, baseline CI, seven linked GitHub issues and division between Codex and Claude before contracts. See the [Opus/xhigh pre-commit review disposition](outputs/codex/2026-11-04-preflight-decisions.md) for corrections and remaining decisions.

## Working agreement

- The candidate owns decisions and must be able to explain every submitted part.
- Architecture choices are proposals until discussed with the candidate. Planning does not authorize implementation.
- Source requirements, proposed decisions, and unresolved questions are labeled separately.
- Keep one canonical SDD; use spikes only for questions with a clear decision and time limit.
- Save future substantive AI prompts and outputs under `outputs/<agent>/`, in English, with the resulting decision or rejection recorded.
- Keep the eventual submission focused on the challenge. The broader job description does not expand its functional scope.

## Current recommendation

After front-loading infrastructure and CI, aim for a functional core on Saturday, November 7, and submission on Monday, November 9, 2026. This is a conditional planning estimate, not an employer deadline; verify any externally agreed deadline separately.
