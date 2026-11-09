# Delivery readiness and manual wallet verification

Date: November 9, 2026. Runtime baseline: `a900629`. This session adds documentation only.

## Assessment

The required implementation is ready for submission. I found no mandatory functionality to add. The candidate subsequently completed the manual two-wallet flow; the observed result is recorded below. No formal interview rehearsal or submission to the evaluators is claimed.

- Rechecked the supplied challenge PDF against the current README and behavior checklist. A browser wallet and testnet deployment are optional; the local flow satisfies the selected network scope.
- Observed all five jobs successful in [CI run 42706226302](https://github.com/dubzn/remitee-challenge/actions/runs/42706226302): Biome, foundation/typecheck, contract tests/reference docs, actual indexer/read API acceptance, and full Docker startup/demo.
- Confirmed that the [repository](https://github.com/dubzn/remitee-challenge) is public. Submission still requires sharing its URL with the evaluators.
- Requested a bounded Claude review using the skill runner's default Sonnet/high settings. [Prompt](../claude/2026-11-09-delivery-review-prompt.md) and [unmodified response](../claude/2026-11-09-delivery-review.md) are retained. Claude found no required-scope blockers. It checked contract/API/manual-flow sources but explicitly did not deeply inspect the indexer implementation or run tests; its broader verdict also relies on supplied CI evidence.

## Changes and review disposition

- Added the [manual two-wallet walkthrough](../../manual-walkthrough.md) and linked it from the README.
- Used public Anvil mnemonic indexes 0 and 1 as separate local signers. The sender signs mint/approval/creation; the beneficiary signs confirmation. Unlike the automated demo, these Cast commands sign transactions instead of submitting unlocked RPC transactions.
- Captured the ID from the actual creation receipt with the packaged ABI. Kept the existing deployment and avoided assumptions about ID 1 or zero balances.
- Adopted Claude's suggestions to retain initial balances, enable pipeline failure reporting and make a missing ID visible. The guide tells the reader to stop on an error and inspect creation before retrying.
- Kept manual polling instructions simple: mine the configured additional blocks, allow processing time and repeat GET. A delayed 404 or Pending response never justifies another creation.
- Added expected custom-error selectors after observing that Cast may print raw revert data without the error name.
- Did not adopt Claude's suggestion to reset the existing stack with `down -v`. Verification used isolated projects; no existing user volumes were removed. Did not add CI machinery, wallet UI, testnet requirements or runtime features.

## Executed verification

Commands were extracted from the guide and executed with Docker's pinned Cast/Node in isolated Compose projects. Temporary drivers added assertions, bounded API polling and expected-failure handling; they are local verification artifacts, not shipped application code.

| Scenario | Observed result |
| --- | --- |
| Default delay 2, repeated manual creation/claim | Three complete checked cycles, IDs 4, 5 and 6, passed. Sender/beneficiary signatures, getter states, exact balance changes and API Pending/Released agreed. Earlier exploratory runs had already created IDs 1-3. |
| Wrong caller while Pending | Sender confirmation reverted with selector `0xacb067e8`; beneficiary confirmation afterward succeeded. |
| Sender cancellation after release | Reverted with selector `0xde9fcd86`; no second payout. |
| Fresh project, delay 0 | Manual creation/claim and API checks passed; `anvil_mine 0` was accepted. |
| Final guide after the full automatic demo | Demo passed, including seven-day time advancement. Exact final guide commands then created ID 11 and completed claim with nonzero existing balances and an older pending deposit in the contract. Balance differences and API results passed. |
| Resolution trace | After resuming the isolated project, the final detail's resolution hash matched the actual beneficiary confirmation receipt. |

The first verification driver stopped on its wrong-caller assertion because it expected the printed error name and Cast returned only the correct selector. This was a driver assumption, not an unexpected contract outcome. The assertion was corrected to inspect the selector; the full run then passed. The guide documents both forms.

Ignored execution artifacts: `.local/manual-walkthrough-2026-11-09/`, including `verify-final.log`, `verify-zero.log`, `verify-after-demo.log` and `final-detail.json`. Temporary project resources were removed after verification; the user's ordinary stack was retained. Runtime code did not change, so the already successful broad suites were not repeated.

## Candidate manual verification

The candidate reported that the walkthrough worked. At the candidate's request I inspected the three Zed terminal panes: Anvil RPC logs, Ponder/application logs and the signed manual commands/results. The local getter, receipts and balance comparisons showed a successful beneficiary claim for escrow 5.

- The deposit was one TEST token (`1000000000000000000` raw units).
- The sender balance decreased by that amount, the beneficiary balance increased by it and the escrow returned to zero.
- Cancellation afterward reverted with `EscrowNotPending(5, 2)`, as expected for Released.
- A separate read-only GET confirmed both API statuses were Released and resolution hash `0xe8dbedb7b8b2a9dd33ba53df7f7866d3f24d9f980636c4fcf9e1660f5986f071` matched the confirmation receipt.
- At verification, head 31 and indexed block 29 matched delay 2 with eligible backlog 0; public health reported ready with all components available.

The earlier 404/Pending responses in the terminal were captured before the indexer caught up. Ponder's idle-block warning was expected on inactive Anvil. I only scrolled the terminals and read the API; no transaction or user-state change was made during that inspection.

## Final review and publication

The later [consistency closeout](2026-11-09-final-consistency.md) records the transversal review, final documentation corrections and publication tracking. GitHub #7 owns the final pushed-SHA CI evidence and the completion of implementation issues. Historical planning remains in the appendix and is not rewritten as current setup guidance.

The candidate owns the evaluator submission and interview preparation: approval/signing, competing resolutions, passive expiry, confirmation delay, transactional deduplication, restart/reorg handling and token limitations remain useful explanation topics. The 45–60 minute evaluator discussion is separate from the operational rehearsal verified here.
