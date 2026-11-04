# Candidate feedback: decisions and independent checks

Date: 2026-11-03. Planning only. See the [worked explanations](../../design-review.md), [review prompt](../claude/2026-11-03-feedback-prompt.md), and [unaltered Claude response](../claude/2026-11-03-feedback-review.md).

## Decision record

- Candidate-selected: PostgreSQL, replacing the earlier SQLite proposal. Update active SDD, indexer spike, delivery budget, and source register; preserve old AI outputs as historical evidence.
- Candidate requested reuse evaluation: compare exact behavior and authority before selecting a library/wrapper. OpenZeppelin v4 Escrow and v5 VestingWallet were checked directly in official documentation; neither is a direct match. Prefer established primitives and minimal domain logic unless a better-fit component is found.
- Adopt OWASP SC05 as AC4 review/test guidance, verified against the linked page. Reuse SafeERC20/guard without claiming a security guarantee or audit.
- Clarify contract state, derived eligibility, transaction attempts, and worker health as separate models. No new on-chain dispute/partial-release states.
- Propose creation-time filters and newest-first escrow records; emit `createdAt` as an extra creation-event field. Preserve all required event data and reuse emitted deadlines.
- Keep broker, dashboard, wallet submission/retries, allowlist, and fee accounting outside this week's baseline. Record failed-receipt observation as future research.

## Claude feedback disposition

| Review item | Codex disposition |
| --- | --- |
| P1: PostgreSQL setup and tests | Adopt real PostgreSQL tests, schema isolation, startup migrations and a proposed single DB container. Budget increment 2-4 hours; Claude estimates 1-2 for PostgreSQL alone. No runtime installation was done. |
| P2: writer concurrency | Adopt dedicated-session advisory lock, loss/reacquisition handling and expected-predecessor cursor check. Do not adopt the suggestion that SQLite locking by itself would have prevented stale application-level cursor writes. |
| P3: response snapshot | Adopt one SQL statement or same-client repeatable-read read-only transaction. Checked PostgreSQL isolation and node-postgres transaction documentation. |
| P4: restart example | No message-broker acknowledgment exists. Durable cursor determines restart; connection loss during COMMIT has an unknown outcome until the DB is queried. Overlap/replay provides duplicate tests. |
| P5: time eligibility | Keep as-of-head flags and expose projection lag. Do not promise monotonic eligibility across resolutions or changed chain views. |
| P6: creation timestamp | Adopt extra event field; descending sequential ID is the smallest deterministic newest-first ordering. |
| P7: retries | Explicitly distinguish reprocessing an event from sending another create with a new nonce. Same-nonce replacement still requires tracking and may contain different calldata; do not label every replacement/retry safe. |
| P8: create ordering | Adopt guarded transfer and received-delta verification before publishing the funded escrow record. Resolution retains effects before payout. |
| P9: PostgreSQL details | Adopt explicit order independent of RETURNING, lossless uint256 storage/serialization and address normalization. Confirm driver behavior against pinned versions rather than rely on unchecked parser assumptions. |
| P10: unavailable block/hash | A verified differing hash triggers halt. Missing/behind/timed-out RPC is unverifiable, not proof of reorg; keep unready/retry and never delete automatically. |

Additional caveat: recipient-deducted fees can lower payout without insolvency; sender-pays-extra fees can consume other escrows' backing. Do not generalize Claude's outgoing-fee statement to every fee model. Full fee-on-transfer support needs separate semantics/tests.

Official receipt documentation confirms mined failure status; it does not make rejected signatures or every internal contract attempt discoverable from event logs. This review and all budget increments are planning judgments, not application test evidence.
