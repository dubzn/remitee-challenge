**Verdict:** G4 is a valid negative control for the guard that was tested. It does not show a difference between Ponder and polling. Keeping polling is defensible under your own fallback rule, but as an engineering conclusion it is premature. Run one test of 3 hours or less before writing the worker.

I read only the PoC report, `run.ts` G1–G5, `src/api/index.ts`, `rpc.ts` and `ponder.config.ts`. I ran nothing.

## Major findings

**1. What G4 shows.**
- **Fact:** The guarded profile sets `reorgWindow: 0` (`experiments/ponder-poc/ponder.config.ts:22`). The latest head it sees is delayed by two blocks (`experiments/ponder-poc/rpc.ts:32-37`). The guard checks chain ID, genesis, the deployment block and native `/ready` (`rpc.ts:16-25`, `src/api/index.ts:11-13`).
- **Inference:** With a window of 0, Ponder treats every block it has accepted as final. So any reorg of an accepted block is past finality by construction. G4 tests two things only: Ponder's behavior after a reorg it cannot recover from, and a guard that never checks the latest indexed block.
- **Fair conclusion:** This guard can return 200 with an orphaned result.
- **Unfair conclusions:**
  - "Ponder mishandles reorgs": P5 passed with a window of 180.
  - "`/ready` is broken": `/ready` reports that historical sync has finished, which is a different job.
  - "Ponder can't delay admission": G1 and G3 passed.

**2. The missing check is needed by both designs.** The polling design also needs this rule: the hash stored for the latest indexed block must equal the chain's hash at that height, or reads return 503. That check is exactly what G4 lacked, and it doesn't depend on the engine. The report says the extra consistency work weakens Ponder's benefit. That undercounts, because you own this check either way.

**3. One combination was never tested: a two-block delay with `reorgWindow > 0`.** That would mean:
- results become visible after two blocks;
- Ponder rolls back automatically within the window;
- reads fail closed beyond the window, if the guard checks the latest block.

Halting on every reorg of accepted data is your design choice. The challenge only asks for a documented policy.

**4. What can change and what cannot.**
- **Can change:** halt versus automatic rollback, the admission depth, the journal and cursor table design, how single-writer is enforced, and replaying into a new schema.
- **Cannot change:** durable, idempotent indexing that survives restarts and hard kills; a documented reorg policy that actual behavior matches; GET detail, list and health; time-derived expiry.
- **Note:** The PoC serves GraphQL. The REST GET endpoints need custom Hono routes either way.
- **My judgment:** Health must not report OK while serving data that the system knows is orphaned.

**5. The asymmetry favors one more test.** Ponder already has evidence for history (P1), restart (P2), hard kill (P3) and competing writers (P4). A custom worker must re-prove all of these. A guard that checks the latest block works with either engine, so a failed test still leaves reusable code.

## One bounded next action (≤3h timebox)

**Setup (G4′), a candidate to verify, not a proven fix:**
- Guarded profile with a two-block delay and a small `reorgWindow` W (for example 4).
- A block handler that runs every block and upserts `{number, hash, timestamp}` into an app-owned `onchainTable`.
- A guard that requires all of:
  - the identity checks pass;
  - the stored hash equals the RPC hash at that number;
  - the real head minus the stored number is at most 2 + k.
- `/health` uses the same decision.

**Cases:**
- Rerun G1–G3.
- R1: reorg an accepted block, shallower than W.
- R2: reorg deeper than W + 2.
- Restart after R2, then the G5 replay.

**Pass when:**
- G1–G3 are unchanged.
- R1:
  - sampling every ~100 ms for 10 s finds no 200 with Released once the canonical hash differs;
  - the result settles to Rejected;
  - no orphaned journal row remains.
- R2: reads and health return 503 for at least 60 s, with no 200 serving the orphan.
- After restart, the service does not silently return 200 again, and G5 replay works.

**Stop and build polling, reusing the guard and harness, if:**
- any 200 serves an orphaned result;
- the app checkpoint row isn't rolled back with the other tables;
- block handlers in 0.18.5 can't do this without reading Ponder's internal tables;
- the timebox runs out.

**Rough effort** (assumes 5–6 h/day, Anvil only, harness reused, no provider issues):

| Item | Estimate |
| --- | --- |
| G4′ test | 2–4 h |
| If it passes: REST, health, expiry, docs, CI | about 1–1.5 days |
| Polling worker from scratch, including re-proving P1–P5 | about 2–3 days |

If it passes, document the policy as: visible after 2 confirmations, automatic rollback within W, fail closed with manual replay beyond W.

## Corrections to Codex's report

- **Fact:** State that G4 is a past-finality reorg because of the configuration, and that ordinary reorg handling was covered by P5, which passed.
- **Fact:** "Remains 200" rests on one sample, taken right after the reorg was logged (`run.ts:319-331`). Whether it stays 200, or the process eventually exits, was not measured.
- **Inference:** Blame the guard's design, not Ponder's sync. The decision rationale should say that polling needs the same latest-block check.
- **Inference:** Say explicitly that halting is a design choice and that a rollback-within-window profile is untested. "Our two simple adapters do not satisfy" holds only for the halt policy.

## Remaining uncertainty (all untested)

- Whether 0.18.5 block handlers behave as I assume, and the block handler's ordering relative to log handlers in the same block.
- Whether the checkpoint row commits in the same transaction as the event rows, and whether rollback reverts upserts.
- Whether Ponder asks the RPC for `finalized`/`safe` blocks, which would bypass the delayed head.
- A gap between the guard's check and the data read exists in both designs. Mitigate it with one read transaction, or check, read, then check again.
- Anvil snapshot reorgs are not real network reorgs.
- This evidence cannot support any general conclusion about Ponder, for or against.

Claude usage remaining:
- Current session: 82% remaining · resets Nov 6 at 12:30pm (America/Buenos_Aires)
- Current week (all models): 93% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
