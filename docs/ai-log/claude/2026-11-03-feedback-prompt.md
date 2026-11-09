# Escrow planning feedback consultation

Date: 2026-11-03. Model: `opus`. Effort: `high`. Mode: read-only subscription consultation. No implementation is authorized.

## Objective

Independently check the candidate's architecture feedback and Codex's proposed responses below. Read `.docs/sdd/escrow.md`, the three planning spikes, and previous review disposition in `/Users/dub/Desktop/solana/remitee-challenge`. The candidate has now explicitly selected PostgreSQL instead of SQLite; older planning/output documents may still describe the previous proposal. This new choice is authoritative. Do not edit files, run commands, write code, invoke other agents, or enlarge the one-week scope. Respond entirely in English, within roughly 1,000 words.

## Candidate feedback, normalized in English

- Which additional escrow states are common and useful for visibility?
- Prefer reusing a maintained escrow implementation or a wrapper if it genuinely reduces security/implementation gaps. Do not assume a custom implementation is necessary.
- Evaluate OWASP SC05:2025 reentrancy guidance for AC4: https://owasp.github.io/www-project-smart-contract-top-10/2025/en/src/SC05-reentrancy-attacks.html . This is guidance, not an executable dependency.
- Explain AC6 idempotency, a possible durable queue, execution traces/retries, and wallet signing. A future monitoring dashboard is of interest.
- Explain restart recovery (AC7) and canonical chain/hash mismatch (AC8) with concrete examples.
- Use PostgreSQL. Explain whether no owner/pause/upgrade/rescue refers to contracts or the API.
- Explain future fee-on-transfer support and whether a token allowlist makes sense despite arbitrary ERC-20 selection in the challenge.
- Explain contract block timestamps, API RPC observations, synchronization lag, recorded/effective states, filters, and a sample response model.
- Consider creation-time filtering and latest N records.
- Record a future way to observe failed transaction attempts, even though reverted transactions emit no surviving escrow logs.

## Current research and proposed response

1. Preserve the challenge's five persisted contract states. Treat expiry eligibility and cancellation window as derived state; keep transaction lifecycle and indexer health separate. Draft/unfunded, disputed, and partial-release states belong to other product models, not this baseline.
2. Reuse SafeERC20 and ReentrancyGuard. Reviewed OpenZeppelin v4 Escrow uses Ether and owner-mediated withdrawals; v5 VestingWallet is beneficiary/schedule based. Neither directly matches all four actor/time paths. A wrapper is not automatically safer; require exact semantics, asset model, maintenance/license, and no new authority before adopting one. This is a bounded comparison, not an exhaustive claim that no matching library exists.
3. Use OWASP guidance to map CEI, all-entry reentrancy guards, cross-function callback tests, rollback on payout failure, and per-token backing. Do not claim an audit.
4. Separate wallet actions from observation. Wallet signing/broadcast produces a hash; mining and indexing are asynchronous. Use at-least-once scanning plus a PostgreSQL unique event identity, insert-on-conflict deduplication, and one transaction for newly inserted journal rows, ordered projection updates, and cursor. Replaying a known event must not regress a terminal projection. Do not auto-resubmit wallet transactions or claim exactly-once chain execution. One indexer writer for the local submission; no broker required.
5. Crash example: checkpoint 100, range 101-110, process dies before commit => none applies; retry the same range. Crash after commit before acknowledgment => duplicate delivery has no projection side effects. Empty ranges still advance.
6. Reorg example: persisted block 110 has hash A and Released; canonical block 110 later has hash B without that event. Height alone cannot detect this. Configurable delay mitigates, hash mismatch halts/unreadies, explicit validated replay repairs; RPC timeout alone is not proof of a reorg or reason to delete data.
7. No owner/pause/upgrade/rescue is the contract's authority model. Deployment signer is not granted fund powers; backend remains read-only. API operational/database privileges are separate from contract privileges.
8. Deposit fee support requires recording net received amount, not simply removing the delta check. Outgoing fees/rebases/blacklists remain distinct problems. No allowlist in the challenge baseline; a production creation-only admission policy can be discussed, preserving exits and acknowledging token mutability.
9. The contract authorizes using transaction block.timestamp. API uses event-provided deadlines and one recently observed RPC head timestamp per response; exposes projected block/hash versus observed head and lag. Derived flags are estimates based on the indexed view, not promises of next-transaction success. Idle head is not itself RPC failure.
10. List escrows, not raw events. Add bounded optional createdFrom inclusive and createdTo exclusive filters based on the creation block timestamp; default newest-created-first deterministic order and limit=N for latest N. Filter status and time before pagination, using one captured chain time. Keep amounts/IDs decimal strings. No relative-time helper parameter or event-history endpoint needed.
11. Future failure observability: a mined reverted transaction has a receipt status even without surviving logs; wallet rejection or failed simulation before broadcast has no on-chain receipt. Known transaction hashes can be observed asynchronously. Exhaustive failed direct/internal-call discovery needs additional indexing/traces/client telemetry; mempool observation is not complete. Do not build this observer/dashboard now.

## Required output

Report prioritized corrections, particularly any incorrect concurrency/atomicity/reorg claim, ERC-20 policy conflict, or misleading API synchronization promise. Distinguish candidate decisions from proposals and future ideas. Recommend only bounded changes to the current plan and flag PostgreSQL's setup/test impact. Include a small response-shape recommendation if materially needed; no application code. Cite concrete repository sections or supplied reference claims, and explicitly label facts you cannot independently verify with your read-only tools.
