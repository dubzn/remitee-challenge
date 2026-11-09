# Read API

I maintain [openapi.yaml](openapi.yaml) as the single machine-readable HTTP contract and serve that same file at GET /openapi.yaml. I validate its examples and actual HTTP responses in tests. The [README](../../README.md) explains design decisions and limitations.

| GET | Success | Errors |
| --- | --- | --- |
| /escrows/{id} | `{escrow, observation}` | 400 invalid ID/query; 404 not found in indexed blocks; 503 verification unavailable |
| /escrows | `{items, page, observation}`; empty matches are 200 | 400 invalid filters/page; 503 verification unavailable |
| /health | 200 ready with components/progress | 400 unsupported query; 503 unready with diagnostics |
| /openapi.yaml | Canonical YAML | Independent of RPC/DB readiness while the API process runs |

## Queries

- Detail IDs are positive canonical decimal uint256 strings, with no signs, leading zeroes, exponent or hex notation.
- List filters: sender, beneficiary and status. Addresses normalize to lowercase; filters combine with AND. Status selects effectiveStatus: Pending, CancelledBySender, Released, Rejected, Expired or ExpiredRecoverable.
- Pagination: limit defaults to 20, range 1..100; offset defaults to 0, range 0..10000. Both use canonical nonnegative decimal input. Results sort by descending ID; filters run before pagination. hasMore comes from the same SQL snapshot, without a total count.
- All inputs are scalar. Empty, duplicate, unknown or malformed parameters return 400; detail, health and openapi.yaml accept no query parameters. Validation precedes dependency checks.

Offset pages can shift between requests as indexing advances. hasMore can be true at the maximum supported offset; the API deliberately bounds deeper pages.

## Values and eligibility

IDs, raw token amounts, chain IDs, block heights/counts and Unix-second timestamps are decimal strings. Pagination and small configuration values are JSON integers. Amounts are not divided by token decimals. Original emitted deadlines are retained.

| Field | Meaning |
| --- | --- |
| onChainStatus | Latest indexed event outcome |
| effectiveStatus | Pending becomes ExpiredRecoverable when the observed head reaches expiresAt; terminal outcomes remain terminal |
| canCancel | Recorded Pending and observed time strictly before cancelDeadline; describes sender eligibility |
| canRecover | Recorded Pending and observed time at/after expiresAt; describes sender eligibility |
| creationTxHash / resolutionTxHash | Successful escrow transactions; resolution is null until a terminal outcome is indexed |
| observation | Verified head/hash/time, indexed checkpoint, delay, recovery window, head lag and eligible backlog |

A 404 includes observation and means absence from those indexed blocks, not proof of absence from newer blocks. Eligibility cannot promise transaction success: a competing resolution not yet indexed or token restriction may prevent it. Expired means successful recovery; elapsed time alone does not create that outcome.

## Consistency and failures

Rows/checkpoint share a read-only repeatable-read snapshot. I require engine readiness, verify deployment/scope, startup catch-up, checkpoint eligibility and canonical hashes against RPC, and recheck before responding. A canonical older prefix may be served with visible lag/backlog. The RPC/SQL race and RPC completeness assumption remain documented limitations.

Data 503 contains a sanitized observation_unavailable error/reason and no escrow data. Health 503 has ready=false, observation=null and partial diagnostics; component reachability does not certify global canonicality. headLag/eligibleBacklog are nullable until comparable heights are available. Expected extra-block waiting is distinct from unprocessed eligible work; I have no post-startup backlog SLA. See the schema for exact reason/component enums.

Data/health responses carry Cache-Control: no-store. Ponder's internal /health and /ready are engine signals; they do not replace this public health response.

## Try it

```sh
curl http://127.0.0.1:3000/escrows/1
curl 'http://127.0.0.1:3000/escrows?status=ExpiredRecoverable&limit=20&offset=0'
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/openapi.yaml
```

The Compose API is published on host loopback. I keep the local interface anonymous and read-only; authentication/caching are future work. [Configuration and recovery](../development.md).
