# Spike 003: time-derived API state

Status: desk reviewed; proposed conclusion recorded in the SDD. No runtime verification. Original timebox: 25 minutes.

## Question and source

The API must report a pending escrow as expired and recoverable after TTL, even when nobody has submitted recovery, and indicate whether sender cancellation remains possible (page 3).

## Working hypothesis

- `onChainStatus` is the latest projected event state.
- `effectiveStatus` is `ExpiredRecoverable` when recorded Pending and observed chain time is at least expiry; terminal states remain terminal.
- `canCancel` requires recorded Pending and observed time strictly before cancellation deadline.
- `canRecover` requires recorded Pending and observed time at or after expiry.
- `status` filtering uses effective status in SQL before pagination. Every result in a response uses the same captured observed head timestamp. Reuse deadlines from events; never recompute them in the API.
- Use canonical head time from RPC, not the host clock and not only the delayed indexed block time. Publish head block/time and indexed block metadata.
- Return 503 for escrow reads while rebuilding or lacking a usable observation; expose failure/last-known metadata in health.

## Questions to close

- Are the names and filter semantics easy to explain and demonstrate?
- How will RPC failure invalidate observation freshness without incorrectly treating an idle Anvil timestamp as a stale connection?
- How are indexer confirmation lag and a possible not-yet-indexed resolution conveyed?
- Which timestamp fields are Unix seconds versus formatted strings? Keep one documented convention.

## Exit and verification

Freeze the response contract and test table. Cover immediately before/at/after both deadlines, terminal escrows after TTL, expiry without a transaction, RPC failure, and time travel on Anvil. Eligibility is an observation, not authorization or a guarantee of transaction success.

## Desk review result

Keep separate recorded/effective states and the documented vocabulary. Use Unix seconds, event-provided deadlines, and one observed head per response. A failed RPC poll invalidates eligibility; an idle old head alone does not. Keep 503 for the baseline rather than adding nullable/stale response modes. Mine an empty block after advancing demo time, observe `ExpiredRecoverable`, then submit recovery. Cover derivation boundaries with focused pure-function tests and filter-before-pagination with DB/HTTP tests.
