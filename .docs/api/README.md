# S3 HTTP contract and examples

Status: implemented with local Anvil/PostgreSQL/HTTP evidence on November 7 and [observed published CI on 80f1367](https://github.com/dubzn/remitee-challenge/actions/runs/42340576160), confirmed November 8. [openapi.yaml](openapi.yaml) is the single machine-readable HTTP contract; embedded examples remain synthetic. Actual consumer responses, raw spec serving and offline Node checks are implemented in application acceptance. [Review, fixes and verification](../outputs/codex/2026-11-07-read-api-implementation.md) are historical local evidence; the [November 8 closeout](../outputs/codex/2026-11-08-documentation-closeout.md) records the new verification separately. The [SDD](../sdd/escrow.md) owns behavior and [progress](../progress.md) owns delivery status.

## Read this first

| Operation | Result | Important errors |
| --- | --- | --- |
| GET /escrows/{id} | `{escrow, observation}` | 400 invalid input; 404 absent in an admitted snapshot; 503 unready/unverifiable. |
| GET /escrows | `{items, page, observation}` | 400 invalid filters/pagination; 503 unready/unverifiable. Zero matches is 200. |
| GET /health | Readiness, component states and progress | 200 ready; 503 not ready with diagnostic progress; 400 unsupported query input. |

The consumer listener binds loopback on API_PORT (default 3000); the spec's port variable documents overrides. Ponder keeps its separate internal listener and native health routes. This is the consumer interface within the local application, not internet deployment or an independent platform. The supplied employer reply accepts internal-process consumers; local access remains anonymous. AuthN/AuthZ and caching remain future issues #14/#13.

## Inputs and pagination

- A detail ID is a positive canonical decimal uint256 string: no sign, fraction, exponent, hexadecimal or leading zero. Exact upper bound is 2^256-1.
- List filters are sender, beneficiary and status. Addresses accept mixed case and normalize to lowercase; checksum casing is not required. A syntactically valid zero-address filter can simply have no matches. Supplied filters combine with AND.
- status selects effectiveStatus, with case-sensitive values: Pending, CancelledBySender, Released, Rejected, Expired and ExpiredRecoverable. Pending excludes time-expired Pending escrows.
- Required filters run in SQL before pagination. Order is decreasing ID. limit defaults to 20, accepts 1..100; offset defaults to 0, accepts 0..10000. Decoded scalar text must match `^(0|[1-9][0-9]*)$` before range checks: no signs, whitespace, leading zeroes, fractions, exponents or hexadecimal. Out-of-range values fail instead of being clamped.
- All parameters are scalar. Empty, duplicate or unknown query parameters return 400. Detail and health accept no query parameters. Creation-time filters and cursor pagination remain outside this baseline.
- page.hasMore refers to the same snapshot as items. The query can fetch limit+1 matches without a total count. Different requests do not share a snapshot; offset pages can move as indexing progresses. hasMore can be true when the next offset would exceed 10000; those later pages are outside this bounded API.

The pagination defaults/limits and HTTP envelope are candidate design decisions, not additional quoted employer requirements.

## Response representation and eligibility

All IDs, amounts, chain IDs, block numbers, block-count metrics and Unix-second timestamps are decimal strings. This includes uint64 createdAt/cancelDeadline/expiresAt and block timestamps, avoiding JavaScript number narrowing. Pagination values and small configuration counts remain JSON integers. JSON Schema patterns/lengths constrain syntax; x-maximum-decimal documents an exact numeric bound that runtime BigInt validation must additionally enforce.

| Field or group | Meaning |
| --- | --- |
| id, sender, beneficiary, token, amount | Indexed escrow identity, parties, asset and exact token units. API does not divide amounts by token decimals. |
| createdAt, cancelDeadline, expiresAt | Emitted absolute Unix-second values. Do not recalculate from today's constants. |
| onChainStatus | Latest admitted event outcome, potentially behind the chain head. |
| effectiveStatus | Pending becomes ExpiredRecoverable when observed head time reaches expiry. Recorded terminal states remain terminal. |
| canCancel | Recorded Pending and observed time strictly before cancelDeadline; describes the sender role, not the identity of an anonymous HTTP caller. |
| canRecover | Recorded Pending and observed time at or after expiresAt. |
| creationTxHash, resolutionTxHash | Successful escrow transactions only; resolution is null for recorded Pending, including ExpiredRecoverable. |
| observation | Verified head/hash/time, indexed checkpoint, configured delay/recovery window, head lag and eligible backlog. |

canCancel/canRecover are observations, not transaction-success promises. A newer unindexed resolution, a competing transaction or an issuer restriction can still prevent a payout. See [token limits](../token-support.md). Expired is a recorded recovery outcome, not merely an elapsed timer.

Use the same validated head time for every row and for effective-status filtering. Rows and checkpoint share a read-only SQL snapshot. Health/readiness and canonicality checks precede a successful response; canonical older prefixes can be served after startup readiness, with visible lag/backlog. RPC and SQL cannot become one atomic cross-system snapshot, so the residual reorg race remains documented.

## Errors and health

Validate input first. For a well-formed detail request, establish a verified observation before deciding 200 versus 404. A 404 includes observation: it means absence at that admitted checkpoint, not proof of absence in a newer block. List queries with no matches return an empty items array.

Data 503 contains an observation_unavailable error and a stable reason; it does not include escrow data. Do not expose SQL, credentials or raw provider errors. Error messages explain the condition; clients should use codes/reasons rather than parsing prose.

Health200 contains ready=true, all components available/ready and a verified observation. Health503 has ready=false, component states, observation=null, a reason and diagnostic head/checkpoint. diagnostics always includes configured confirmationDelay/reorgWindowSeconds; headLag/eligibleBacklog are nullable and only computed from available comparable same-scope heights with nonnegative results. A failed RPC probe has no current head, so observedHead is null. No remembered head, durable health history or token-status observer is required.

Components describe their own current probes. RPC/database up means reachable and queryable, not verified data correctness. Indexer ready means native readiness passed and startup floor met; catching_up means one of those gates is unmet, not a promise of progress. Unavailable means its endpoint cannot be reached; unknown means not assessed. Hash/scope/identity mismatch can leave components up/ready while global ready=false. Diagnostics are not one verified observation and cannot label escrow data fresh.

Input validation precedes all readiness checks. The chosen guard order is deployment identity/RPC, captured head, SQL snapshot/checkpoint, scope, startup floor, checkpoint eligibility, canonical checkpoint hash, head/checkpoint recheck, then engine readiness. Health probes components independently where possible, and selects the first failed verification in that order; observation_unavailable is the sanitized catch-all. A noncanonical checkpoint returns 503 during either recoverable or unrecoverable mismatch. Use verified history/Ponder recovery evidence to decide replay: waiting reorgWindowSeconds in wall-clock time proves nothing about the timestamp-based rollback window.

Expected extra-block waiting alone is not failure. After startup, no eligible-backlog threshold/SLA has been selected; expose the backlog without inventing one. Startup catch-up and unverified/noncanonical progress are unready. An unchanged head successfully queried on idle Anvil is not an outage. All data/health successes and errors carry Cache-Control: no-store. Only the three exact GET business paths are covered here; trailing-slash aliases, unknown routes, other methods and static docs are outside their operation schemas. Malformed percent-encoding in matched input returns 400. Raw specification serving is independent of data readiness while the API process is running; Swagger UI is optional.

## Selected implementation boundary

Native Node 24 node:http serves the three consumer GET routes and GET /openapi.yaml; no HTTP framework was added. Ponder's Hono facade stays internal. Both run as one local application with a shared launcher and separate loopback listeners.

The launcher computes the startup floor once, then starts both children with the same resolved deployment file, database/schema, delay, recovery window, INDEXER_PORT and INDEXER_STARTUP_MIN_BLOCK. The API entry refuses a missing floor; an explicitly computed zero is valid. Both children derive the same scope key. If either exits, the launcher stops the sibling; a new launch recomputes context. No durable store was added. Run npm run indexer:start after the existing infrastructure/deployment setup in the [runtime guide](../indexer-runtime.md).

## Examples to inspect

The OpenAPI components/examples section contains pending and released detail, a large ID/max uint256 amount, an expired-but-unclaimed list, an empty list, invalid input, admitted absence, unavailable read and ready/RPC-failed/startup-catch-up health. These are fixtures, not observed deployment results.

With the application running on the default API port:

```sh
curl http://127.0.0.1:3000/escrows/1
curl 'http://127.0.0.1:3000/escrows?status=ExpiredRecoverable&limit=20&offset=0'
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/openapi.yaml
```

## Validation and remaining delivery gates

Pinned Node dev tools validate the canonical artifact offline: @redocly/openapi-core 2.76.0 checks OpenAPI structure; yaml 2.9.1 and Ajv 8.20.0 Draft 2020-12 validate examples and actual HTTP responses, including x-maximum-decimal bounds. There is no second schema source or runtime validation dependency. npm ci installs the lockfile. The [November 6 review](../outputs/codex/2026-11-06-read-api-spec.md) remains historical specification evidence.

Run the same checks as the existing CI application job:

```sh
npm run api:spec
npm run api:unit
npm run indexer:test
```

The integrated test uses real contracts/Ponder/PostgreSQL and checks public filters, pages, exact time boundaries, transaction traces, repeatable snapshots, 400/404/503 and RPC/DB/startup/reorg behavior. It also verifies raw spec availability during dependency failure and shared-child lifecycle. These S3 checks passed in published CI on 80f1367. November 8 NatSpec/forge doc has separate local verification; the clean full-start/demo remains S4. Swagger UI is optional.

Primary references: [OpenAPI 3.1.0](https://spec.openapis.org/oas/v3.1.0), [Ajv schema support](https://ajv.js.org/json-schema.html), [Redocly core](https://github.com/Redocly/redocly-cli/tree/main/packages/core).
