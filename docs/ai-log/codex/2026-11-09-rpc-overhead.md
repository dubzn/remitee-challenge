# RPC overhead review

Validation only; runtime code is unchanged. [Opus/xhigh review](../claude/2026-11-09-rpc-overhead-review.md).

Subsequent scope decision: keep deployment identity at startup only and assume a fixed RPC/deployment until restart. [Implementation and results](2026-11-09-rpc-optimization.md).

## Measured behavior

An isolated Compose stack with a counting proxy recorded **420 upstream JSON-RPC calls in 30.24 seconds: 13.89/s**, without consumer traffic or new blocks. Startup was excluded. The sample contained 30 Ponder polls and 15 application healthchecks. Anvil's separate localhost healthcheck bypassed the proxy and is not included.

Instrumenting the actual runtime functions against a controlled RPC fixture independently confirmed seven calls per Ponder latest request and fourteen per healthy API health request. identity contributes five calls each time; API reads invoke it twice. The checkpoint header is requested twice after the SQL snapshot.

| Path | Current, measured | Proposed, estimated |
| --- | --- | --- |
| Ponder poll, unchanged eligible head | 7 | 2 |
| Healthy API read | 14 | 3 |
| Idle application at default intervals | About 14/s | About 3.5/s |

The proposed budget excludes startup and adds five identity calls when the indexer observes a new block hash, plus normal indexing work. A live network producing blocks is not equivalent to idle Anvil, even without API consumers.

## Safety and recommendation

Claude confirmed the counts but rejected unconditional removal from the indexer. A live replacement chain sharing genesis may be accepted as a bounded reorg; Progress can then write new checkpoints under the original scope. Hash comparisons alone no longer prove the deployment matches. I checked the relevant Ponder reconciliation/finality code and the Progress handler. This scenario is source-inferred, not reproduced with a modified indexer. Existing reset tests stop the application first.

Repeated identity is also not strictly just an error-classification improvement: in the isolated fixture, changing Anvil's chainId from 31337 to 31338 left the head hash unchanged, while the current health endpoint returned deployment_identity_mismatch. Removing runtime checks therefore requires an explicit stable-network/immutable-code assumption; debug mutations without new blocks are a remaining boundary.

Proposed implementation:

- Retain launcher validation; add explicit API startup validation, including its standalone path. This changes startup behavior when RPC is unavailable.
- Verify indexer identity on the first request and whenever the observed eligible block hash changes. Mark a hash verified only after success; never reuse cached successful readiness after RPC failure.
- Replace the two per-read identity checks with fresh head capture and post-snapshot checkpoint/head hash comparisons. Preserve scope, startup floor, unclamped delay eligibility, read-only snapshot and connection cleanup.
- Fetch the checkpoint header once in the final pair. Preserve checkpoint_hash_mismatch for its mismatch and chain_changed_during_read for a head-only mismatch; revise documented precedence and diagnostics accordingly.
- Add request-count, live-reset/redeployment, RPC-outage-after-success, hash-change and standalone-startup regressions before applying this change.

Raw counts and the chainId experiment are ignored under .local/rpc-overhead-2026-11-09. The measurement project was removed; the existing local stack was untouched. No optimization, commit, push or new remote CI result is claimed.
