# Reduce recurring RPC work

The accepted scope assumes a fixed RPC endpoint and deployment until restart. Identity is verified at startup by the launcher before it starts Ponder and explicitly by the API before listening. Runtime identity tracking and hot deployment replacement handling are excluded. This supersedes the broader recommendation in the [initial review](2026-11-09-rpc-overhead.md).

The transport change removes one recurring identity call; confirmation-delay and log/block caps remain intact. API reads capture a fresh head, read one SQL snapshot, release its connection and fetch checkpoint/head hashes together. The checkpoint is fetched once, sharing the final request when it equals the head. Scope, startup floor, eligibility, normal reorg handling and RPC-failure responses remain. There is no cached response or readiness.

Deployment identity mismatch is now a startup diagnostic rather than an HTTP response reason. OpenAPI and the API guide describe the startup behavior and final hash-error precedence. The private Spanish copies match the accepted scope.

## Verification

- The original request-count regressions failed before implementation. Final units cover two calls per poll, advancing blocks, RPC failure/recovery, three calls per API read, SQL release before final hashes, mismatch reasons and zero-delay request sharing.
- The isolated idle sample fell from 420 calls in 30.24s (13.89/s) to 102 in 30.192s (3.38/s). Both exclude startup and Anvil's separate localhost probe. Sample timing accounts for 30 polls and 14 healthchecks in the final run; the steady-state budget is about 3.5/s.
- Biome, root/indexer types, OpenAPI validation, 18 indexer units, 16 API units, 19 real indexer/HTTP observations and 13 full Docker checks passed. Ordinary bounded/deep reorg handling, restart, idempotency and outage behavior remain covered.
- The local stack was rebuilt and is ready. Its chain head and four existing escrows were preserved; the served OpenAPI matches the current file.

Evidence remains ignored under .local/rpc-optimization-2026-11-09. No new Claude consultation, commit, push or remote CI result is claimed.
