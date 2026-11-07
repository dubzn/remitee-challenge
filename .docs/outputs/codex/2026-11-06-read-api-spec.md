# S3 HTTP specification and review disposition

Date: November 6, 2026. Deliverable: the [OpenAPI 3.1 contract](../../api/openapi.yaml), embedded synthetic examples and [reading/implementation guide](../../api/README.md). This is the agreed specification-first step before handlers. It does not complete S3, AC9/AC10 or #11; no API listener, contract behavior, runtime dependency, CI job, cache or authentication middleware was implemented. Pre-existing documentation changes were preserved.

## Independent review

The candidate requested ask-claude with xhigh effort. Retained the established Opus model and invoked the subscription-only runner in read-only consult mode with `--model opus --effort xhigh`. Preflight was ready (pro); the request exited 0 with no stderr. [Exact prompt](../claude/2026-11-06-read-api-spec-prompt.md) and [unmodified response/footer](../claude/2026-11-06-read-api-spec-review.md) are retained. Claude reported READY_WITH_FIXES and executed no tests or edits.

The reviewed draft SHA-256 was dd7ee9faf8ea5591d7021aaba71039689ac3e3b2523a1f7043b4c2e8d33792f0. Findings refer to that draft's line positions. Codex applied the dispositions below and independently validated the final artifact; no second Claude call or claim of reviewer approval of the revised artifact is made.

| Finding | Disposition and evidence |
| --- | --- |
| F1: insufficient health503 progress | Adopted. Diagnostics always carry configured delay/window and nullable headLag/eligibleBacklog. Metrics need available comparable same-scope heights and nonnegative results; unavailable/inconsistent values stay null. Added a startup-catch-up example. |
| F2: ambiguous component states | Adopted with explicit separation. RPC/DB probe availability and engine readiness are distinct from global verified-read readiness. A mismatch can leave components up/ready while global ready=false. The guide defines reason order and state meanings. |
| F3: API startup floor could silently become zero | Confirmed directly in scripts/indexer.ts and config.ts: the current launcher passes the computed floor only to the Ponder child; settings defaults to zero. Selected shared-launcher context for both future children and refusal of a missing API startup floor. This is a plan, not a runtime fix or new current API capability. |
| F4: numeric query coercion | Adopted. Decoded scalar text must match the documented canonical unsigned decimal pattern before exact range checking. |
| F5: RPC-down example implied remembered state | Adopted. observedHead is null when unavailable; checkpoint is best-effort current diagnostic data. No health history/cache introduced. |
| F6: obsolete indexer head-cache wording | Adopted. SDD time-source row, diagram and failed-probe wording now match per-response head capture in readObservation. |
| F7: catch-all and ordering | Adopted. observation_unavailable is sanitized fallback. Guard order retains identity/head/snapshot/scope/floor/eligibility/hash/recheck, followed by engine readiness; input validation is first. Component probes can be independent. |
| F8: unadmitted resolution caveat | Adopted in both eligibility descriptions; an apparently eligible record may already have resolved in a newer unadmitted block. |
| F9: replay after waiting reorgWindowSeconds | Rejected as phrased. The installed pinned Ponder 0.18.5 computes its rollback boundary from block timestamp differences: utils/finality.ts targetTimestamp and sync-realtime/index.ts blockMovesFinality. Elapsed wall-clock wait does not prove that a mismatch is unrecoverable. Reads remain 503 while noncanonical; validated recovery-window/history evidence determines rollback versus explicit replay. |
| F10: hasMore at bounded offset | Adopted. More matching data can exist beyond the allowed offset; the next page is then outside this bounded API. |
| F11: unspecified routing/error edges | Clarified scope to the three exact business GET paths; malformed matched input is 400 and unclassified observation failure is sanitized 503. Other routes/methods, trailing aliases and static resources are outside these operation schemas. |
| F12: current reader is not the public API adapter | Confirmed. S3 must add bounded parameterized SQL, filter before pagination, stringify chainId and map raw column names/integers to the public response. No claim that current /observed endpoints satisfy S3. |

Native node:http is selected for the small consumer listener instead of adding Fastify or another HTTP adapter dependency. Ponder's Hono facade stays internal. Both planned children share the launcher-resolved deployment/scope/delay/window/floor and stop together; the guide describes the pending implementation. No eligible-backlog threshold/SLA is invented after startup, matching the supplied clarification.

## Executed verification

- openapi-spec-validator 0.7.2 validated the OpenAPI 3.1 document. PyYAML 6.0.3 and the validator were installed only in ignored .local/openapi-tools; no application dependency or lockfile changed.
- A temporary Draft 2020-12 checker validated all 14 response-example uses, their referenced schemas, exact numeric-bound annotations and fixture semantic consistency. It checked response representation, page bounds/order, time-derived fields, resolution hash nullability and observation/diagnostic lag equations where applicable. These are fixture/spec checks, not HTTP behavior tests or proof that SQL filtering is implemented.
- Six malformed fixtures were rejected: zero/leading-zero/non-string IDs, uint256 overflow, uint64 overflow and an unsupported effective state. Exact uint256/uint64 maxima were accepted by the augmented bound check. Standard pattern/length checks alone do not enforce those numeric maxima; runtime BigInt checks remain mandatory.
- Examples include time expiry without recovery, a terminal release remaining terminal after expiry, empty results, large integers, admitted absence, RPC failure and startup catch-up. No deployment results are fabricated.
- Final Markdown/link/anchor checks and git diff --check passed; raw Claude outputs were preserved and the staged index stayed empty. No contract suite or Anvil/PostgreSQL/HTTP suite was rerun because no runtime source changed. Existing application evidence remains valid for its recorded implementation commit, not acceptance of the future HTTP layer.

## Next implementation gate

Implement pure input/eligibility rules, bounded snapshot queries, public serialization, health probes/error mapping and shared launcher lifecycle. Use the same OpenAPI file for real HTTP response checks; integrate pinned validation into existing Node CI with S3. Verify exact time boundaries, address/effective-state AND filters before pagination, max integers, terminal outcomes, 400/404/503 precedence, no-store and RPC/DB/startup/reorg failures. Only then close AC9/AC10 and the relevant #5/#11 work.

## Runner usage footer

Claude usage remaining:

- Current session: 93% remaining · resets Nov 7 at 1:29am (America/Buenos_Aires)
- Current week (all models): 92% remaining · resets Nov 8 at 11:59am (America/Buenos_Aires)
