# Spike 002: indexing, atomicity, and recovery

Status: desk reviewed; proposed conclusion recorded in the SDD. No runtime verification. Original timebox: 40 minutes.

## Question and source

The challenge requires event subscription, idempotency, restart recovery, and a documented reorg strategy (page 2). Keep this proportional to one contract on a local chain.

## Working hypothesis

One process contains one ordered indexer and the API; PostgreSQL is the durable projection. Use one HTTP polling worker to observe the head and scan missed contract logs. No separate websocket/watcher plus timer paths.

Candidate feedback replaces the earlier SQLite choice. Enforce a deployment-scoped session advisory lock and expected-cursor compare-and-set; use one dedicated client for worker transactions. Tests must use actual PostgreSQL and cover competing starts, stale cursor writes, and commit-outcome ambiguity. API rows/metadata need one consistent read snapshot. See [worked examples](../design-review.md). No separate transaction-execution queue is implied.

Commit each bounded range's deduplicated journal entries, projection mutations, and end-block checkpoint/hash together. Advance empty ranges. Scope event identity by chain and deployment; sort by block, transaction, and log order. Repeat/overlap must not reapply a mutation.

Use configurable delay, now proposed as 2 additional blocks in the local demo and 0 only as an explicit fast mode, plus deployment anchor and checkpoint hash validation. On a verified mismatch halt and mark unready. Reset/replay is explicit after validating deployment metadata; suppress escrow responses until caught up. Do not automatically delete and replay from a stale anchor. See the [confirmation and capacity follow-up](../safety-review.md).

## Questions to close

- Confirm exact metadata/fingerprint: chain ID, contract address, deployment block/hash, and current checkpoint.
- Confirm event key and transaction boundaries, including a crash between journal insert and projection update.
- Define block/hash checks before commit and startup, and what triggers rebuild versus halt.
- Confirm startup/readiness behavior, singleton writer, bounded RPC ranges, and error/retry reporting.
- Confirm minimal real-DB tests: duplicate, multi-event block ordering, rollback, restart, empty block, mismatch, and reset.

## Exit and scope boundary

Record one exact recovery policy in the SDD, with evidence to be implemented later. A confirmation delay mitigates shallow forks; it does not guarantee finality or replace honest mismatch handling. Full replay is acceptable for this small exercise; generalized common-ancestor rollback is outside the timebox.

Provider/model follow-up, Nov 6: see [dedicated design and existing-engine comparison](../indexer-design.md), [PostgreSQL models](../postgres-models.md) and [source-review output](../outputs/codex/2026-11-06-indexer-and-models.md). This expands the proposal; AC6-AC8 remain unverified.

## Desk review result

Adopt one polling worker, atomic bounded-range commits, retained event journal, and one halt/unready path. Use explicit validated reset/replay for recovery. This simplifies the initial per-block/dual-watcher proposal and avoids the unsafe interpretation of automatic replay after a deployment identity change. Keep actual-DB duplicate, rollback, restart, ordering, empty-range, and mismatch tests in S2.
