# Spike 002: indexing, atomicity, and recovery

Status: desk reviewed; proposed conclusion recorded in the SDD. No runtime verification. Original timebox: 40 minutes.

## Question and source

The challenge requires event subscription, idempotency, restart recovery, and a documented reorg strategy (page 2). Keep this proportional to one contract on a local chain.

## Working hypothesis

One process contains one ordered indexer and the API; SQLite is the durable projection. Use one HTTP polling worker to observe the head and scan missed contract logs. No separate websocket/watcher plus timer paths.

Commit each bounded range's deduplicated journal entries, projection mutations, and end-block checkpoint/hash together. Advance empty ranges. Scope event identity by chain and deployment; sort by block, transaction, and log order. Repeat/overlap must not reapply a mutation.

Use configurable confirmations, local default 0, plus deployment anchor and checkpoint hash validation. On any mismatch halt and mark unready. Reset/replay is explicit, after validating the correct deployment metadata; suppress escrow responses until caught up. Do not automatically delete and replay from a stale deployment anchor.

## Questions to close

- Confirm exact metadata/fingerprint: chain ID, contract address, deployment block/hash, and current checkpoint.
- Confirm event key and transaction boundaries, including a crash between journal insert and projection update.
- Define block/hash checks before commit and startup, and what triggers rebuild versus halt.
- Confirm startup/readiness behavior, singleton writer, bounded RPC ranges, and error/retry reporting.
- Confirm minimal real-DB tests: duplicate, multi-event block ordering, rollback, restart, empty block, mismatch, and reset.

## Exit and scope boundary

Record one exact recovery policy in the SDD, with evidence to be implemented later. A confirmation delay mitigates shallow forks; it does not guarantee finality or replace honest mismatch handling. Full replay is acceptable for this small exercise; generalized common-ancestor rollback is outside the timebox.

## Desk review result

Adopt one polling worker, atomic bounded-range commits, retained event journal, and one halt/unready path. Use explicit validated reset/replay for recovery. This simplifies the initial per-block/dual-watcher proposal and avoids the unsafe interpretation of automatic replay after a deployment identity change. Keep actual-DB duplicate, rollback, restart, ordering, empty-range, and mismatch tests in S2.
