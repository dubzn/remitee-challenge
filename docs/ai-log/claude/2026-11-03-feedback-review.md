I couldn't write the plan file because no Write, ExitPlanMode or AskUserQuestion tool is available in this session. That fits the read-only brief, so the full consultation is below.

# Consultation: escrow planning feedback (read-only)

## Summary

Most of Codex's 11 responses hold up. Three need correcting before the SDD is updated:
- **Writer safety:** with PostgreSQL, "one writer" has to be enforced, not just assumed (P2).
- **API consistency:** the API must read its metadata and its rows from the same database snapshot (P3).
- **Wording:** the crash example in item 5 assumes a message queue that doesn't exist (P4).

There is also a direct conflict in the docs: the delivery plan explicitly rules out PostgreSQL (P1).

## Prioritized corrections

**P1. PostgreSQL contradicts the current plan, and it changes setup and tests.** `.docs/delivery-plan.md` (Scope cuts) says "Do not introduce PostgreSQL, queues, separate services, Docker…". The SDD also still says SQLite in four places: Scope, the Stack row, the architecture diagram, and Verification. Spike 002 does too. The candidate's choice of PostgreSQL wins, so all of these need updating, along with the explanation for dropping that guardrail.
- **Setup:** the one-command start now needs a running PostgreSQL server. My recommendation is a pinned Docker Compose `postgres` service with a healthcheck, plus plain SQL migrations applied at startup. That means accepting Docker as a prerequisite and lifting the delivery plan's Docker ban.
- **Tests:** AC6 and AC7 tests must run against real PostgreSQL, not an in-memory imitation. Each test should get its own schema or database. Testing a crash before commit needs a fault-injection hook between the projection update and `COMMIT`.
- **Budget:** add roughly 1–2 hours. This is my estimate, not something I measured.

**P2. A single writer must be enforced (concurrency).** SQLite's file locking serialized writers by accident; PostgreSQL won't. If two indexers run at once (say, a second `npm start` or a test process), a slow one can write cursor 110 after the other has already committed 120, so the cursor goes backwards. Removing duplicate events doesn't stop that. Two small fixes:
- Take a session-level `pg_advisory_lock` at startup.
- Make each range commit compare-and-set: update the cursor only `WHERE block = expectedPrev AND hash = expectedPrevHash`, and abort if zero rows change.

**P3. API reads need one database snapshot.** Item 9 promises one consistent view per response. But under PostgreSQL's default READ COMMITTED isolation, every statement sees a fresh snapshot. The cursor/indexed-block read, the rows, and any count could then reflect different commits. So a row could include a resolution newer than the reported `indexedBlock`. Fix: run the metadata read and the row query in one `REPEATABLE READ READ ONLY` transaction, or as a single statement.

**P4. Fix the crash example in item 5.** There is no broker, so there is no "acknowledgment". After a commit, a restart reads cursor 110 and starts from 111; nothing is delivered twice. Duplicates only come from deliberately overlapping ranges or an explicit replay, and those are no-ops. The real ambiguity is the database connection dropping during `COMMIT`. The stored cursor is the authority on restart.

**P5. Head time vs. inclusion time (sync promise).** The contract checks the `block.timestamp` of the block that includes the transaction, and that is at least the observed head timestamp. So `canCancel = true` at the head time can still miss the deadline. Derived flags should say "as of observed head N at T". Item 9 already calls them estimates, so tighten the wording rather than the design.

**P6. Creation-time filter: add `createdAt` to the `Created` event.** Logs don't reliably include block timestamps (unverified across Anvil versions), so filtering on creation time would mean extra block lookups. Working it out as `expiresAt − 7 days` conflicts with the SDD rule against recomputing deadlines. Emitting `createdAt` is a tiny contract change. "Newest first" is simply `ORDER BY id DESC`, because IDs increase in chain order. Note in the README that offset pages can shift when new escrows arrive.

**P7. Wallet retries (AC6 explanation).** Resolutions are naturally safe to repeat: a second terminal action reverts. **Creation is not.** Resending a create with a new nonce makes a second escrow and locks funds twice. Replacing a transaction with the same nonce is safe. Say this explicitly.

**P8. Reentrancy ordering for `create` (item 3).** The balance-delta check means the token transfer has to happen before the final state writes. So the "checks-effects-interactions" pattern from the OWASP guidance doesn't apply literally to `create`; `nonReentrant` covers that path. The proposed order:
1. Read the balance.
2. Call `transferFrom`.
3. Check the received amount.
4. Write storage.
5. Emit the event.

That way a getter called during a token callback never sees an unfunded escrow (read-only reentrancy). Resolutions keep the normal order: terminal state first, then payout.

**P9. PostgreSQL details to get right:**
- `INSERT … ON CONFLICT DO NOTHING RETURNING` reports which events are new, but the order of the returned rows isn't guaranteed. Apply projection updates in the indexer's own sorted order, filtered by the returned keys.
- Store amounts and IDs as `NUMERIC(78,0)`, which fits uint256.
- `node-postgres` returns `int8` and `NUMERIC` values as strings (unverified here). Parse block numbers explicitly.
- Normalize address case on write and in filters.

**P10. Reorg detection edges (item 6).** Checking the latest checkpoint hash catches a reorg at any depth up to the checkpoint, because each block hash commits to its ancestry. A head below the checkpoint, or no block at checkpoint height (for example a fresh Anvil with the same chain ID), counts as a mismatch, not a wait. The pre-commit recheck narrows the race window but doesn't close it; the SDD already admits that remaining risk.

## Confirmed as stated

- **Items 1, 2, 7, 8, 11.**
- **Allowlist:** a constructor-fixed allowlist would break the challenge's "any ERC-20 per escrow" requirement (page 2). An admin-managed one would add authority and conflict with "no owner". So the baseline has none.
- **Fee-on-transfer:** an outgoing fee reduces what the recipient gets but doesn't make the escrow insolvent.
- **No owner/pause/upgrade/rescue:** this describes the contract's authority model. Database credentials are a separate, local-only concern for the API.
- **Durable queue:** not needed. The journal plus cursor already act as the durable log.

## Recommended response shape

Put the observation details once at the top level, not on every item:

```
{ "observation": { "chainId", "headBlock", "headHash", "headTimestamp",
                   "indexedBlock", "indexedHash", "confirmations", "lagBlocks" },
  "items": [ { "id": "12", "amount": "1000000", "createdAt", "cancelDeadline",
               "expiresAt", "onChainStatus", "effectiveStatus",
               "canCancel", "canRecover", "createdTx", "resolvedTx" } ],
  "page": { "limit", "offset", "order": "id_desc" } }
```

## Decisions, proposals and future ideas

| Type | Items |
| --- | --- |
| **Candidate decisions** | PostgreSQL; prefer an existing library or wrapper only where it genuinely closes gaps |
| **Proposals** (still needing candidate sign-off) | Codex items 1–10; P2–P10 above |
| **Candidate suggestions to consider** | Creation-time filter, latest N |
| **Future only** | Monitoring dashboard, failed-transaction observer, allowlist/admission policy, fee-on-transfer support, a separate read-only database role |

## Not independently verified

I had read-only tools and no web access, so these are unconfirmed:
- The contents of OpenZeppelin v4 `Escrow` and v5 `VestingWallet`.
- The OWASP SC05 page text.
- Whether logs include `blockTimestamp` on any given node.
- The default type parsing in `node-postgres`.
- Docker being available on the reviewer's machine.

The repository references come from `.docs/sdd/escrow.md`, `.docs/delivery-plan.md`, `.docs/spikes/001`–`003`, and `.docs/outputs/codex/2026-11-03-review-disposition.md`.

Claude usage remaining:
- Current session: 88% remaining · resets Nov 4 at 12am (America/Buenos_Aires)
- Current week (all models): 98% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
