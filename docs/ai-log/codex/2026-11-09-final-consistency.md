# Final consistency and delivery closeout

Date: November 9, 2026. Reviewed runtime baseline: `a900629`, plus the manual guide and delivery records awaiting publication.

## Outcome and scope

No blocking contract, indexer, API or documentation defect was found. The [read-only Claude review](../claude/2026-11-09-final-consistency-review.md), requested through the subscription runner with default Sonnet/high settings, covered the full current indexer core and API, contracts, launcher/deployment/demo, Compose/CI and maintained documentation. [Exact prompt](../claude/2026-11-09-final-consistency-prompt.md).

Claude inspected test structure and selected assertions rather than every test body, and ran no tests. This closes the requested cross-cutting consistency/readability review; it is not an exhaustive audit. I independently checked the findings, current source paths and execution evidence.

## Findings and disposition

| Finding | Final disposition |
| --- | --- |
| Stale readability-checklist test counts | Updated to 18 indexer units, 16 API units, 19 real integration observations and 13 Docker checks; linked prior stages as history and made the checklist discoverable from the behavior checklist. |
| Unused manual SQL command/scaffold | Removed `db:sql`, its unused dispatcher/imports/input argument and the empty migration marker. Ponder continues to own the application schema. Also removed obsolete markers from populated contract source/test directories. |
| Foundry digest repeated across builds | Added reciprocal sync comments to Compose and Dockerfile.app; verified the pinned image strings match. No image or compiler setting changed. |
| Project-image interpolation uncertainty | Executed `docker compose -p remitee-config-check --profile app config --format json`: application/deploy images were both `remitee-config-check-app:local`. The documented per-project image is correct. No service was started by this probe. |
| RPC budget wording too broad | Clarified that fetching the latest eligible block uses two RPCs. Event synchronization can add calls; the API's three-block-request budget remains unchanged. |
| Retryable snapshot race | Documented a transient `checkpoint_not_eligible` 503 when indexing advances between head capture and SQL snapshot, and repeating the read for a fresh head. |
| Outdated CI header | Reworded the comment to describe all five jobs; workflow behavior is unchanged. |
| Optional naming/type refinements | Left local event/read Observation types, status representation and validated partial-settings casts unchanged. No demonstrated behavior defect or unused runtime export/parameter required a broader refactor. |

Repeated validation at configuration, ingestion and response boundaries remains intentional. SQL and response shaping share expiry semantics through existing integration coverage. No generic validation layer, competing writer, cache or new dependency was introduced.

## Acceptance evidence

The maintained [behavior checklist](../../sdd/escrow.md) owns current rules. This maps the original numbered acceptance criteria to executed evidence without rewriting historical planning.

| Original criteria | Evidence |
| --- | --- |
| AC1: exact funding, validation and no-return tokens | 62 Foundry tests, compiled ABI checks and token/balance fixtures. |
| AC2: all four timed payouts | Before/exact/after deadline examples and four-outcome Docker demo. |
| AC3: caller, unknown ID and terminal-state errors | Contract access/state matrix, competing resolutions and the candidate's rejected post-claim cancellation. |
| AC4: external-call safety and backing | Adversarial token/reentrancy and per-scenario backing assertions. No stateful invariant suite is claimed. |
| AC5: events/getter agreement | Contract reconstruction assertions plus actual indexer and demo trace/getter comparisons. |
| AC6: idempotent observations | Identical/conflicting replay units and actual Ponder/PostgreSQL processing. |
| AC7: durable restart and atomic progress | Interrupted SQL writes, graceful/abrupt restart, journal/projection/checkpoint comparisons. |
| AC8: delay/reorg/replay | Configured block delay, within-window rollback, beyond-window blocked reads and explicit replay into a fresh schema. |
| AC9: read API and time-derived eligibility | Detail/list filters before pagination, exact decimal strings, traces and chain-time boundary tests. |
| AC10: public readiness and progress | RPC/DB/engine failures, partial health diagnostics and fresh hash/snapshot verification. |
| AC11: local startup/demo | Thirteen full Docker checks, clean projects, repeated demos, retained history and restart/refusal checks. |
| AC12: docs, review and explanation preparation | README, OpenAPI, generated NatSpec reference, retained AI reviews and the candidate's personally executed signed two-wallet walkthrough. No formal interview rehearsal is claimed. |

The [published runtime CI](https://github.com/dubzn/remitee-challenge/actions/runs/42706226302) passed all five jobs. The [manual-verification record](2026-11-09-delivery-readiness.md#candidate-manual-verification) documents the candidate's escrow 5, payout balances, matching receipt, expected revert and healthy caught-up API.

## Verification of these corrections

- `npm run check` passed after removing the unused SQL runner: strict TypeScript, isolated Anvil/PostgreSQL smoke, rollback/lock behavior, restart, unavailable database and project-scoped cleanup.
- `npm run lint:ci` passed for 39 files without diagnostics.
- Checked local documentation targets, README npm-script references and JSON examples, matching pinned Foundry images, Compose project interpolation and identical command blocks in the local reading copy.
- Reviewed every changed file before splitting commits. Contract source/configuration, indexer/API implementation and automated lifecycle assertions are unchanged. The proposed solvency invariant was cancelled before implementation; fuzz/invariant work remains an explicit future improvement.
- Full CI is run again on the final published SHA; its exact result and URL are recorded in [#7](https://github.com/dubzn/remitee-challenge/issues/7), avoiding a claim that an earlier runtime CI result covers a later publication.

Ignored local logs: `.local/final-closeout-2026-11-09/`. The candidate's ordinary stack was already stopped at this closeout; it was not restarted or reset. Foundation verification used its own disposable project.

## Tracking and handoff

Issues #5, #6, #11 and #12 have implementation/documentation evidence. The superseded Ponder evaluation #10 is resolved by #4 and the implemented verified read path. #7 records final review, publication CI and operational rehearsal. Earlier proposals remain as history with current acceptance appended; moved documentation links are corrected rather than deleting decisions.

Pause (#8), upgrades (#9), caching (#13) and service authentication/authorization (#14) remain future work. The candidate owns sharing the public repository URL and the evaluator discussion; no message or submission was sent on the candidate's behalf.
