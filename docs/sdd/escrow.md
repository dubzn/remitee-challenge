# Behavior and acceptance checklist

I use this checklist to verify the implementation; [README](../../README.md) owns decisions, assumptions, limitations and future work.

| Area | Required behavior | Verification |
| --- | --- | --- |
| Funding | One deployment manages multiple positive IDs; creation locks the exact amount atomically. Invalid parties/token/amount or detected transfer failure creates no escrow. | `contracts:check`: validation, funding, allowance and no-return/adversarial token cases |
| Resolution | Sender cancels before 2h, beneficiary confirms/rejects before 7d, sender recovers at/after 7d. Only confirmation pays the beneficiary. | Contract exact-boundary, role, balance and event tests |
| Finality of outcome | Only Pending resolves; unknown IDs, wrong callers and repeated/competing actions revert. No administrator exit. | Contract access/state matrix and ABI checks |
| External calls | Reentrancy cannot create an underfunded escrow or resolve twice. Reverting/false-returning payouts restore Pending and emit no surviving resolution event. | Adversarial token/callback tests under the supported-token assumptions |
| Events | Creation and four resolution events reconstruct the record and successful transaction traces. Getter facts agree. | Contract event assertions and actual indexer/Docker demo |
| Idempotency | Duplicate observations do not duplicate rows or reset terminal state; conflicting identities fail; only one writer runs per selected scope. | `indexer:unit`, actual PostgreSQL/Ponder integration |
| Recovery | Journal/projection/checkpoint commit together, including empty-block progress. Restart catches up after crash without partial updates. | Actual transaction interruption, process kill and restart |
| Chain changes | Configured delay is enforced. Deployment/hash/scope mismatch blocks reads; bounded canonical rollback works and deeper recovery requires explicit validated replay. | Admission, fork, RPC outage, identity refusal and replay cases |
| HTTP | Detail/list expose exact values, traces, recorded/effective status and eligibility; AND filters precede newest-first pagination. Invalid input, absence from indexed blocks and unverifiable state have distinct responses. | API units, canonical OpenAPI and actual HTTP/schema tests |
| Time/health | Expiry without an escrow event becomes ExpiredRecoverable. Public health reports dependency state and progress without stale successful data during verification failure. | Exact HTTP chain-time boundaries, readiness, snapshot and failure cases |
| Local delivery | One Compose command starts node/database/deployment/indexer/API. Normal stop/up and down/up retain chain history, deployment and escrows; new transactions advance beyond the saved chain time. The demo works again after restart. Explicit replacement of the chain still refuses old data. | `app:test`: clean startup, four-outcome demos before/after restart, exact history/receipt/state comparisons, monotonic timestamps and refusal checks |
| Documentation | Runnable setup/test commands, contract NatSpec, OpenAPI, assumptions/limits/improvements and retained AI output. | README, generated contract reference, API checks and `docs/ai-log/` |

The API observes indexed state. It does not sign, retry or cancel wallet transactions. Time alone never transfers tokens. Ponder's native health/readiness listener is internal; the consumer interface is the documented read API.
