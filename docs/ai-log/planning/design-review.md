# Architecture feedback and worked examples

Date: 2026-11-03. Planning only; no application code. This note answers candidate feedback and supplements the [canonical SDD](sdd/escrow.md).

## Decisions versus proposals

- Confirmed by the candidate: PostgreSQL replaces SQLite. Foundry + TypeScript remain selected.
- Proposed: one event-polling worker, a durable event journal, atomic projection/cursor commits, and no separate queue broker.
- Proposed: add creation-time filters and deterministic newest-first ordering to the escrow list.
- Future observations: transaction-attempt monitoring, dashboard, production token admission, and fee-on-transfer support. They are not mandatory scope.
- Follow-up on 2026-11-04: the candidate confirmed observation-only AC6 and simple token behavior. [Safety follow-up](safety-review.md) explains confirmation waiting, capacity and the still-open pause discussion; it supersedes the earlier unqualified no-pause wording as a closed decision.

## 1. Three different state models

Escrow products do not all share the same workflow. Common product concepts include draft/unfunded, funded, disputed, partially released, refunded, and expired; they are not a universal enum to import.

| Layer | Relevant states or observations | Baseline treatment |
| --- | --- | --- |
| Contract escrow | Pending, CancelledBySender, Released, Rejected, Expired | Preserve the challenge's exact state machine. Creation and funding are atomic. |
| Read-time eligibility | Pending with cancellation still open; pending awaiting a decision after cancellation closes; ExpiredRecoverable | Derive from recorded state and event deadlines; do not add contract states. |
| Transaction attempt | Awaiting wallet signature, submitted, mined success/revert, replaced, not yet observed | Different lifecycle; not currently a durable API feature. |
| Indexer | Ready, catching up, RPC unavailable, halted/rebuilding | Service health; never substitute these for an escrow's state. |

Disputes require an arbitrator and new authority; partial releases change accounting. Both are outside this exercise. An unfunded on-chain escrow is unnecessary when creation transfers the deposit in the same transaction.

## 2. Reuse before custom code

Compare existing components against token support, actors, two deadlines, all four resolutions, multiple escrow IDs, terminal immutability, event completeness, maintenance/version/license, and authority. A wrapper does not inherit a security guarantee for new composition or business rules.

| Reviewed component | Mismatch with this challenge |
| --- | --- |
| [OpenZeppelin v4 Escrow](https://docs.openzeppelin.com/contracts/4.x/api/utils#Escrow) | Ether/payee balances and owner-mediated withdrawals; not the required per-ID ERC-20 acceptance/rejection model. |
| [OpenZeppelin v5 VestingWallet](https://docs.openzeppelin.com/contracts/5.x/api/finance#VestingWallet) | Beneficiary and vesting schedule; does not directly implement the four sender/beneficiary resolution paths. |
| SafeERC20 and ReentrancyGuard | Reusable primitives that fit token calls and callback protection; domain rules still need tests. |

Recommendation: a minimal domain state machine on established primitives, unless a bounded comparison finds a maintained exact-fit implementation. This is not an exhaustive claim that no suitable escrow exists. Do not adopt a large protocol or old dependency solely because its name contains escrow.

Use [OWASP SC05:2025](https://owasp.github.io/www-project-smart-contract-top-10/2025/en/src/SC05-reentrancy-attacks.html) as AC4 review/test guidance: checks-effects-interactions for payouts, guarded mutating entry points including creation, adversarial callbacks across actions, and atomic rollback on payout failure. It is guidance, not a package to install or an audit certificate. SafeERC20 alone does not prevent reentrancy.

## 3. Durable observation, idempotency, and wallet signing

Wallet signature/broadcast, block inclusion, and projection are separate steps. A wallet call can return a hash before mining; [viem documents that distinction](https://viem.sh/docs/contract/writeContract). The read-only indexer never needs the user's private key and must not automatically retry wallet actions.

The event journal is a durable record of observed contract events. Retrying its processing is safe only because side effects are idempotent:

1. Identify an event by deployment scope, transaction hash, and log index. Validate chain/contract/deployment identity before processing.
2. Insert with a unique constraint and conflict handling. Only newly inserted events may change the projection; a repeated creation must not reset a Released escrow to Pending.
3. Apply new events in block/transaction/log order and commit journal, projection, and range-end checkpoint in one PostgreSQL transaction on the same client. Filter the sorted events by newly inserted keys; RETURNING order is not an ordering guarantee.
4. On failure roll back the whole range and retry from the durable checkpoint. Enforce a deployment-scoped session advisory lock plus an expected-prior-cursor check; duplicate protection alone is not concurrency control. Stop/reacquire after a lost worker connection.

[PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) provide the all-or-nothing boundary, and [INSERT conflict handling](https://www.postgresql.org/docs/current/sql-insert.html) supports deduplication. Do not call this exactly-once blockchain execution. It is repeated observation with idempotent local effects.

No Redis/RabbitMQ/BullMQ is needed for the baseline. The journal records successful on-chain transitions; checkpoint/error metadata and structured logs describe indexing attempts. A full durable execution-attempt history is a separate enhancement, not something the event journal automatically provides. A future dashboard can consume this read model without changing fund authority.

The journal survives process restarts; an explicit canonical rebuild can replace it. It is not yet a permanent audit archive of orphaned events. Repeating a create with a new nonce can lock funds twice in distinct escrows; do not confuse local event deduplication with wallet-action idempotency.

## 4. AC7: crash and restart

Checkpoint is block 100. The worker fetches range 101-110 with a creation and release. If it dies after inserting the creation but before database commit, the entire transaction rolls back: no partial journal/projection update survives, and checkpoint stays 100. On restart it fetches 101-110 again.

If the commit succeeded before the process died, all rows and checkpoint 110 already exist. Restart begins at 111; a deliberately overlapping replay deduplicates the old events. A range with no escrow events still advances the cursor to avoid scanning it indefinitely. Restart itself requires no wallet interaction.

## 5. AC8: block height is not block identity

Suppose indexed block 110 has hash A and contains EscrowReleased. A reorganization replaces it with canonical block 110, hash B, without that release. The height is still 110, but the old Released projection is no longer valid.

With confirmation delay 2 and observed head 112, eligible indexing ends at 110. This reduces shallow-reorg exposure but does not guarantee finality. Persist the deployment anchor and last indexed block hash, not only heights. On a verified mismatch stop indexing, report unready, and explicitly validate deployment configuration before reset/replay. The repaired projection may return to Pending; a later canonical event determines the real outcome.

A timeout or missing RPC response is not proof of a reorg: retry/degrade without deleting the DB. A changed chain ID/address/deployment anchor may be a local reset or wrong configuration; never replay blindly into the old deployment.

## 6. Contract authority and token policy

No owner/pause/upgrade/rescue refers to the **contract**. The deployer receives no special fund powers. Sender and beneficiary rights are per escrow. Restarting the API, owning the database, or running a future dashboard gives no right to move escrow funds.

Initial baseline accepts standard/no-return ERC-20s, with no token allowlist. This matches arbitrary token selection while rejecting mismatched deposit amounts. A production allowlist can reduce known asset risk, but adds governance and cannot prevent later token upgrades, blacklist changes, or pauses. Any future admission control should affect new deposits without disabling existing users' exits.

Fee-on-transfer is not just removing a check: a requested 100 with a 2% deposit fee produces liability 98, which must be recorded/emitted. A further outgoing fee can leave the beneficiary below 98; sender-pays-extra fees can consume backing belonging to other escrows. Received-amount support therefore needs an explicit asset model, outgoing-payment guarantee, events/API changes, and new invariant tests. Keep it future scope; do not give a precise implementation estimate before settling those semantics.

## 7. Chain time, projection lag, and filters

The transaction's block.timestamp authorizes actions in the contract. The API observes RPC head time and reuses emitted deadlines. Its `onChainStatus` is the **indexed** chain outcome, potentially behind the head; `effectiveStatus` adds time eligibility. Neither guarantees a transaction submitted now will succeed.

Example: head is 120, projection is through 118. A release in 119 may not yet appear. Expose both block identities, confirmation delay, and lag. Read rows/checkpoint from one SQL statement or `REPEATABLE READ READ ONLY` transaction, on one client, and use one compatible observed head/time across rows. PostgreSQL's default READ COMMITTED across separate statements is insufficient. No API design eliminates the race with a later transaction/block.

`GET /escrows` lists escrow records, not raw events. Proposed optional filters: `createdFrom` inclusive and `createdTo` exclusive, using `createdAt` added to the creation event from block.timestamp. Apply address, effective-state, and time filters in SQL **before** pagination. `limit=10` returns the newest ten matching escrows; a time window instead selects records created between two timestamps. Decreasing sequential ID gives deterministic newest-first order within this contract; pagination is not a snapshot across separate HTTP requests.

For `status=ExpiredRecoverable`, select recorded Pending with `expiresAt <= observedTime`. For `status=Pending`, select recorded Pending with `expiresAt > observedTime`. Otherwise an expired-but-unclaimed escrow would disappear from the useful expired filter or be mislabeled refunded.

### Proposed response model

Fictional example after TTL and before any recovery transaction. Amounts/IDs are decimal strings; timestamps are Unix seconds. The array uses the same item fields as the detail endpoint, with list-level pagination/observation metadata.

```json
{
  "items": [{
    "id": "42",
    "sender": "0x1111111111111111111111111111111111111111",
    "beneficiary": "0x2222222222222222222222222222222222222222",
    "token": "0x3333333333333333333333333333333333333333",
    "amount": "100000000",
    "createdAt": 1793707200,
    "cancelDeadline": 1793714400,
    "expiresAt": 1794312000,
    "onChainStatus": "Pending",
    "effectiveStatus": "ExpiredRecoverable",
    "canCancel": false,
    "canRecover": true,
    "creationTxHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "resolutionTxHash": null
  }],
  "page": {"limit": 10, "offset": 0, "hasMore": false},
  "observation": {
    "chainId": "31337",
    "observedHead": {"number": "120", "hash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "timestamp": 1794312001},
    "indexedThrough": {"number": "118", "hash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
    "confirmationDelay": 2,
    "lagBlocks": 2,
    "eligibleHead": "118",
    "eligibleBacklogBlocks": 0
  }
}
```

## 8. Failed attempts are observable, with limits

A mined reverted transaction still has a [receipt with failure status](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactionreceipt), although reverted escrow logs do not survive. A known hash can be monitored asynchronously without signing again. A missing receipt alone does not prove failure: it may be pending or unknown to that provider.

Wallet rejection or simulation failure before broadcast has no chain transaction to discover; client telemetry is needed. Discovering every failed direct contract call requires scanning transactions/receipts beyond event logs; internal calls may require execution traces. Mempool watching is provider-dependent and incomplete. Track this as future research, including timeout/replacement/reorg handling, not a new dashboard/observer to build this week.
