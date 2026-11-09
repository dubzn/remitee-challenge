# Consultation: confirmations, worker capacity, and emergency pause

Date: 2026-11-04. Requested model: `opus`. Effort: `high`. Mode: read-only subscription consult. Planning only; do not edit files, run commands, implement code, or invoke another agent.

## Task and evidence

Read `.docs/sdd/escrow.md`, `.docs/design-review.md`, and the earlier decision records in `/Users/dub/Desktop/solana/remitee-challenge`. Challenge source: `/Users/dub/Downloads/Remitee_Challenge_Blockchain_Engineer.pdf` if your read tool supports PDFs. Reply in English, approximately 900-1,100 words maximum, with clear recommendations and unresolved decisions. Cite concrete source rules and distinguish checked facts from assumptions. Codex is independently browsing primary sources.

## Candidate's new feedback

1. Accept AC6 as observation and traceability only, not transaction execution or a wallet retry queue.
2. Ask Ethereum's average block interval and whether one worker suffices or parallelism makes sense.
3. Suggest keeping transactions in an intermediate state and waiting for confirmations before treating them as truth. They want the trace to reflect transaction status and ask whether this replaces AC8 reorg handling.
4. Explicitly ask to discuss with Claude a global pause/gateway that can stop escrow withdrawals across deployments. They believe funds remain safe because TTL lets the original sender recover later, even while paused. They want genuine security reasoning despite this being an exercise.
5. Keep simple ERC-20 support now, without fee/rebase complexity; still satisfy required no-return transfers.

## Architecture constraints

- The challenge calls for ONE contract managing MANY escrow IDs, not one deployment per escrow. Sender deposits; sender cancels before 2h; beneficiary confirms/rejects before 7d; sender recovers from 7d. Only sender/beneficiary can cause the specified transfers. No third party may move funds. Creation is specified as always allowed, subject to validations.
- Current proposed contract has no privileged owner/pause/upgrade/rescue. The new pause suggestion reopens that design decision; it is not approved implementation scope yet.
- One ordered PostgreSQL projection writer, durable journal, range checkpoint/hash, advisory lock, and atomic updates. Candidate values one-week scope and understandable security.
- Backend never signs or submits wallet actions. Tx confirmation/observability is distinct from on-chain escrow state.

## Questions to resolve

**Throughput:** Explain why one ordered writer is a reasonable initial design for one address, without claiming a benchmark or inferring capacity from block interval alone. If useful later, propose bounded concurrent RPC prefetch with ordered commits, not naive parallel mutation. Name minimal evidence/metrics that would justify it.

**Confirmations:** Current `eligibleHead = head - confirmationDelay` already delays projection. Recommend how to explain observed/mined-but-unconfirmed/eligible versus consensus-finalized. Confirm finite N does not eliminate deeper reorgs or faulty RPC. Should we persist a second provisional observation journal in this week? Consider using existing head/checkpoint/lag metadata and a worked timeline instead. A possible local demo default is 2 additional blocks; 0 only an explicit fast mode. Do not silently identify descendant depth with wallet/library confirmation count.

**Pause threat model:** Compare (a) no pause, (b) creation-only pause in the existing contract, (c) pause creations and beneficiary release while leaving cancel/reject/expiry recovery available, (d) pause every outflow. For each, analyze safety versus liveness, admin compromise, rule deviations, incident types it actually contains, and what bugs remain exploitable through allowed refunds. Do not equate absence of a pause with proof of a bug or pausing with proof funds cannot get stuck.

**Gateway:** Explain direct-call bypass unless checks are enforced in every underlying action, changed msg.sender under forwarding, external-controller failure risks, and why one multi-escrow deployment already supplies a natural global switch if a policy is chosen. Do not implement a gateway or factory.

**TTL:** Show a concrete scenario disproving unconditional "funds never lock because they expire": if the recovery function also checks pause, elapsed TTL does not bypass it. If recovery stays unpaused, explain the remaining refund-path exploit risk and beneficiary censorship. Non-upgradeability also means pause alone cannot patch an unknown bug; migration/recovery would need a separate design.

Return a concise judgment grounded in the challenge. The candidate requested discussion, so do not treat a new pause authority, extra deployment, provisional event store, or parallel workers as accepted scope. Identify any minimum question that must be settled before implementing pause. No application code is needed.
