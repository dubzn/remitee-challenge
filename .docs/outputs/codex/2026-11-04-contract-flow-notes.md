# Contract flow explanation: Codex output

Date: 2026-11-04. Planning only. Candidate request: diagram contract scope/interactions and explain whether time alone releases funds.

Output: [four contract diagrams](../../contract-flows.md), covering lifecycle, atomic creation/funding, resolution guards/payout rollback, and expiry without a transaction.

Key clarifications:

- A new authorized resolution transaction triggers each payout; time alone does not call the contract.
- Beneficiary acceptance may release immediately after creation; the two-hour cancellation window is not a lockup before acceptance.
- Reject/cancel/recover pay the stored sender; accept pays the stored beneficiary. Final state prevents a second payout.
- ExpiredRecoverable is an API interpretation of a still-Pending escrow until successful sender recovery.
- Business acceptance differs from blockchain confirmation depth. The read-only indexer does not release funds.
- Approval is an existing allowance or a separate prerequisite; create and funding are atomic. No second withdrawal follows successful acceptance.
- Emergency pause remains open and is not silently added to the baseline flows.

Verification: parsed/rendered the four diagrams with Mermaid 11.12.0 and inspected the previews. Corrected a clipped creation note and reduced overview width. Markdown links, diagram structure and state/time rules were checked. Preview files are outside the repository; no application code, contract execution, new Claude consultation, or commit is part of this task.
