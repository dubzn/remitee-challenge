# Pre-commit review and infrastructure-first task split

Date: 2026-11-04. Model: `opus`. Effort: `xhigh`. Read-only subscription consultation; respond directly, not through plan-file or ExitPlanMode steps. Do not edit files, run commands, implement contracts or invoke another agent.

## User-authorized task

Independently double-check the current documentation/contract flow diagrams. If there are no major corrections left, Codex should commit and push the English documentation. The candidate proposes Docker local infrastructure, initial GitHub CI and GitHub issues before contract implementation, and explicitly requests dividing work between Claude and Codex. Whether to implement that infrastructure immediately or only prepare the next block is pending clarification. Do not infer authorization to implement the escrow.

## Bounded evidence

Repository: `/Users/dub/Desktop/solana/remitee-challenge`. Read `.docs/sdd/escrow.md`, `.docs/contract-flows.md`, `.docs/safety-review.md`, `.docs/infrastructure-plan.md` and `.docs/delivery-plan.md`. Use `.docs/references.md` or original `/Users/dub/Downloads/Remitee_Challenge_Blockchain_Engineer.pdf` only as needed to resolve a requirement. Do not read every historical prompt/output or private local reading copy.

Existing changes are documentation only. PostgreSQL, observation-only AC6, simple/no-return ERC-20 compatibility are accepted. Pause authority is explicitly open; no literal ban on pause/owner/gateway exists in the challenge. Do not present a design preference as a source rule. Four diagrams were parsed/rendered and visually checked; no runtime contract behavior is verified.

## Review questions

1. Identify any major factual/security/behavioral error that should block committing this planning record, versus decisions that merely block later implementation. Focus on payout triggers, actors, exact time boundaries, atomicity, event reconstruction, idempotent ordered projection, confirmation waiting and reorg scope.
2. Check that the flow diagrams do not suggest automatic refunds, delayed mandatory beneficiary acceptance, a second withdrawal after release, or an indexer that signs/executes transactions.
3. Challenge the infrastructure-first block. Keep it minimal: Compose Anvil/PostgreSQL, pinned tools, real connectivity/rollback/mining checks, isolated test strategy and initial CI. No speculative application/domain code or fake passing suites. Review the proposed ownership split and dependency order.
4. The old delivery plan treats CI as optional and contracts first on Nov 4. Recommend the smallest correction: front-load already-budgeted local setup, promote a timeboxed basic CI and preserve the one-week cap. State any important scheduling risk without inventing measured throughput.
5. Suggest at most seven GitHub issues with short titles, role ownership, dependency edges and concrete exit conditions. Prefer slices that support testing as features are added.

## Output

Limit roughly 1,100 words. Lead with `READY`, `READY_WITH_MINOR_FIXES`, or `NEEDS_MAJOR_CORRECTION` for the documentation commit. Separate major blockers, minor required fixes, open implementation decisions and future enhancements. Cite exact file/section evidence. Give a concise issue/dependency outline and independent-review split. No application code and no claim of a security audit. Codex will verify advice and correct remaining issues before staging or pushing.
