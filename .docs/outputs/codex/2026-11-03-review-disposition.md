# Codex disposition of Claude's review

Date: 2026-11-03. Input: [unmodified Claude Opus/high review](../claude/2026-11-03-review.md). No implementation was performed.

Codex checked the advice against the supplied four-page challenge, current SDD, and candidate constraints. The candidate confirmed Foundry + TypeScript familiarity. Recommendations remain proposed architecture choices for discussion.

| Finding | Disposition | Reason / resulting plan |
| --- | --- | --- |
| F1: simplify reorg/identity recovery | Modified | Use one halt/unready failure path, then explicit reset/replay after validating deployment identity. Do not automatically wipe/replay from an old deployment block when its anchor no longer matches. The new chain may contain a different deployment even at a reused address. |
| F2: range transactions and one wake-up mechanism | Adopted | One HTTP polling worker; atomic bounded-range journal/projection/cursor commits; include empty ranges; sort by block, transaction, and log position. No live callback writer. |
| F3: reuse event deadlines | Adopted / clarified | API derives time state from persisted `cancelDeadline` and `expiresAt`; no duplicate deadline arithmetic. Prefer pure derivation tests plus focused HTTP tests. |
| F4: filter before pagination | Adopted | Apply derived status conditions in SQL using the same captured observed chain time as response derivation. |
| F5: mine after time travel; staleness | Adopted with caveat | Demo explicitly mines before observing recoverable expiry. Failed RPC observation makes reads unready; an idle head does not. Do not adopt an unconditional claim that `canRecover` stays true: the escrow can resolve, the observed fork can change, or a token can block payout. Flags remain observational. |
| F6: serve stale records instead of 503 | Deferred | Keep 503 on observed RPC failure for a small, honest response contract. Nullable eligibility plus stale-data modes add a second behavior that is unnecessary for the baseline. |
| F7: token-level fund locking | Adopted as limitation | Explicitly document token pause/blacklist/rebase risks. Do not implement pull payments; they change the design and cannot generally bypass a token's own restrictions. |
| F8: small contract-spec gaps | Adopted | Explicit custom domain errors, getter reverts for unknown IDs, zero/code-less token checks, indexed creation identifiers/parties, terminal actor field. |
| F9: README assumptions and install/HTTP examples | Adopted | Existing delivery gate covers these; make rejected fee support, exact boundaries, self-beneficiary exclusion, and optional-feature rationale visible. |
| F10: avoid repeated planning | Adopted within authorized stage | Spikes now record desk-review conclusions; do not run another 90-minute research cycle. Claude's suggestion to start coding on Wednesday does not authorize implementation. |

## Effort reconciliation

Claude estimates approximately 25-36 hours including contingency. Codex keeps the conservative 30-40 hour planning envelope, accounting for the planning/review stage and verification rather than assuming all simplifications immediately save measured time. Neither range is implementation evidence. Both recommend Friday November 6 as a functional checkpoint and Monday November 9 as submission target.

Optional additions are capped at two: focused invariants/fuzzing (2 hours) and basic CI (1 hour), after mandatory acceptance. Do not automatically swap failed optional work for another tool.

## Provenance and limits

Claude's opening reference to an empty review file describes the output file while the retry was running; the actual earlier failed attempt is separately preserved as `2026-11-03-attempt-01.txt`. No response existed from that first attempt. The successful review was produced by the retry.

No smart contract security audit, production certification, test execution, or complete runnable artifact is claimed by either analysis.
