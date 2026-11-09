**Verdict: all three gaps and `scripts/indexer.ts` are equivalent, and no correction is required.** This comes from reading source only; I ran nothing.

**1. `scripts/demo.ts`: retained.** Every baseline assertion has a current counterpart:
- preflight: `scripts/demo.ts:32-58`, `scripts/demo.ts:69-74`
- per-payout balances, including recovery: `scripts/demo.ts:156-158`
- expiry: `scripts/demo.ts:192`, `scripts/demo.ts:202-212`
- getters: `scripts/demo.ts:226-227`
- traces: `scripts/demo.ts:185-187`
- final balances and health: `scripts/demo.ts:266-268`, `scripts/demo.ts:234-237`

Callers, recipients, contract statuses 1–4, payout order and output key order match.

Harmless differences:
- The final loop now asserts `creationTxHash`, `resolutionTxHash` and `amount` before `onChainStatus`, `sender`, `beneficiary` and `token`. Only the reported `DEMO_FAILED` message can change, and only with multiple mismatches.
- `balances()` reads all three values before asserting; the baseline alternated reads and asserts.
- `scripts/demo.ts:207` makes two extra balance reads.
- `assert.ok(expiring)` at `scripts/demo.ts:259` is new and cannot fail with the constant table.

**2. Hash codes: preserved.** The order is still scope, `startup_catchup`, `checkpoint_not_eligible`, `checkpoint_hash_mismatch`, final identity, `chain_changed_during_read` (`apps/indexer/read-model.ts:150-175`).

**3. 42P01 and identity trace: preserved.**
- Snapshot 42P01 still gives `checkpoint_unavailable` with database left `up` (`apps/indexer/read-model.ts:139-141`). The health probe still maps it to `up` (`apps/indexer/api/health.ts:34-35`).
- Only the initial identity check writes the trace: mismatch means RPC `up`, other failures `down` (`apps/indexer/read-model.ts:85-95`). The final check (`apps/indexer/read-model.ts:168`) cannot touch it, matching baseline.
- `client.release()` still runs before validation, because `finally` runs before the `return` completes.

Harmless differences:
- `BigInt(head.*)` now runs after `trace.head` is set, but regex validation means it cannot throw.
- Extracted async functions add only microtask ticks.
- `reason ??=` replaces `if (!reason)`; `reason` is only null or a non-empty string.

**`scripts/indexer.ts`: equivalent.** The floor rewrite has the same truth table (`scripts/indexer.ts:25-26`). Child arguments, environment, signals, exit handling and log keys match. `import.meta.resolve('ponder')` now runs after environment construction but still before any spawn, with the same refusal path.

**Limitations:** I assumed the baseline snapshot matches HEAD, and that `rpc.ts` is unchanged because it is absent from the diff and git status. I did not assess whether tests exercise 42P01 or the two hash-code paths, so source order is the evidence there.

Claude usage remaining:
- Current session: 67% remaining · resets Nov 9 at 4:49pm (America/Buenos_Aires)
- Current week (all models): 94% remaining · resets Nov 15 at 11:59am (America/Buenos_Aires)
- Current week (Fable): 100% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
