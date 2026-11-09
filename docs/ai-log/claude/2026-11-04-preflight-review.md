**READY_WITH_MINOR_FIXES**

I read the five documents, `references.md` and pages 1–2 of the challenge PDF. This is a desk review only. I ran nothing, and it is not a security audit.

## Major blockers: none

I checked the documents against PDF pages 1–2 ("Antes de creación + 2 h / 7 días", "Desde creación + 7 días", "ni siquiera el owner"):

- **Triggers, actors and time boundaries:** `sdd/escrow.md:31-40` and `contract-flows.md:15-20,100-106` match the PDF:
  - Cancel, confirm and reject use a strict `<` deadline.
  - Recovery uses `>=` and only the sender can call it.
  - A rejection pays the sender.
- **Atomicity:** `contract-flows.md:88-96` sets the final state before the transfer, and a failed payout reverts everything. The reentrancy guard also covers creation (`sdd:104-105`).
- **Projection:** `sdd:118-124` covers the essentials:
  - an advisory lock plus a check that the stored cursor matches the expected predecessor;
  - a frozen range end and explicit log sorting;
  - only newly inserted events change the projection;
  - one transaction per range, including empty ranges.
- **Confirmations and reorgs:** the example at `safety-review.md:27-31` is correct: with delay 2, an event in block 111 is admitted at head 113. A mismatch after admission halts indexing until an explicit replay (`sdd:79,130-132`).
- **Q2:** No diagram suggests:
  - an automatic refund (`contract-flows.md:28,116`);
  - a mandatory wait before the beneficiary can accept (`:106,126`);
  - a second withdrawal after release (`:11`);
  - an indexer that signs or sends transactions (`sdd:87-99,126`).
- **Pause:** the documents present it as an open decision, not a rule from the challenge (`safety-review.md:43`). The PDF's "ni siquiera el owner" assumes an owner may exist.

## Minor fixes before committing (consistency only)

1. **CI status contradicts itself.** `sdd:21` and `delivery-plan.md:48` call basic CI optional after the mandatory work; `infrastructure-plan.md:7` makes it baseline. Use "baseline, timeboxed" in all three.
2. **Container scope.** `delivery-plan.md:48` and `sdd:165` describe "a single pinned PostgreSQL container", but Compose now also runs Anvil (`infrastructure-plan.md:11`).
3. **Stale calendar.** `delivery-plan.md:35` still schedules the contract for Wed Nov 4.
4. **Authorization claim.** `infrastructure-plan.md:3` says creating GitHub issues is authorized. My brief only says the candidate *proposes* issues. Codex should check the candidate's actual words before creating them; I can't verify this.
5. **"Startup may reuse local data" (`infrastructure-plan.md:13`).** Anvil's chain is lost when its container restarts, but PostgreSQL's data persists. A fresh Anvil uses the same chain ID (31337) and deterministic deployer nonce, so it gives the **same contract address on a different chain**. State that `reset` removes both. Later startup must rely on the AC8 anchor and checkpoint hash checks, not on chain ID or address.
6. **Nits:**
   - At `contract-flows.md:112`, change "Current chain time" to "latest observed head timestamp", to match `sdd:74`.
   - Optionally list the event names the PDF requires (`EscrowCreated/Cancelled/Released/Rejected/Expired`) in AC5.

## Open implementation decisions (they block code, not this commit)

- **Pause policy:** blocks the contract issue only.
- **Replaying an older overlapping range:** `sdd:118` says the stale write is rejected and rolled back. `sdd:120` says the newer cursor is left unchanged. Pick rejection, so the tests expect a single outcome.
- **Log verification:** decide whether to check each log's `blockHash` or only re-check the range-end hash. This matters with load-balanced RPC providers, not with Anvil.
- **Two clocks in API reads:** eligibility is computed from the head time, while rows come from the eligible head (`sdd:138`). Keep this, and document the window it creates.

## Future enhancements

No change: parallel fetching, a provisional view and a failed-transaction observer stay deferred.

## Infrastructure-first: keep it, with these changes

- **Don't put contract tests behind Docker.** `forge test` runs its own in-process EVM. Make a scaffold the first commit (repo layout, `foundry.toml` with a pinned solc, `.gitignore`). Once the contract is authorized, contract and Compose work can then run in parallel. This is the main way to recover the lost day.
- **Make test isolation fit AC6/AC8:**
  - PostgreSQL advisory locks are scoped per database, not per schema (my understanding; check it in the foundation). With one schema per suite, a lock key derived from the deployment, and Anvil's deterministic addresses, parallel suites will block each other. Use one database per suite or per test worker.
  - Time and mining on a shared Compose Anvil are global, so time-travel tests interfere with each other. Integration suites should spawn their own pinned Anvil or run serially. The Compose Anvil is then for development and the demo.
- **Smoke checks that reduce later risk:**
  - chain ID;
  - set the next block timestamp, mine, and get exactly that timestamp;
  - mining N blocks adds N to the block number;
  - snapshot, revert and mine again gives a different hash at the same height, which shows a reorg fixture is viable;
  - a PostgreSQL `BEGIN`/`INSERT`/`ROLLBACK` leaves no row;
  - one negative case (stop PostgreSQL and the check exits non-zero), so the check can actually fail.
- **Containers:** inside the container Anvil must listen on `0.0.0.0`, with only the host port bound to `127.0.0.1`. Pin the Anvil image to the same Foundry version used locally and in CI (1.4.1 locally, `infrastructure-plan.md:47`).
- **CI hardening:**
  - trigger on `pull_request`, never `pull_request_target`;
  - `permissions: contents: read`;
  - pin actions by commit SHA;
  - set `timeout-minutes`;
  - run `compose down -v` under `always()`;
  - install with a frozen lockfile;
  - don't name jobs in a way that implies contract or API coverage.

## Ownership split

Mostly sound, with one real risk. The contract carries 30% of the evaluation weight and is assigned to Claude, but "Codex owns shell execution" (`infrastructure-plan.md:35`). An implementer who can't run `forge test` only iterates through handoffs. I recommend one of two fixes:

- give Claude's contract task bounded permission to run `forge build` and `forge test`, or
- swap roles: Codex implements, and Claude writes the adversarial test matrix and reviews.

Also freeze the event signatures early in the contract issue, because they are the indexer's input. Give each shared root file (lockfile, compose file, workflow) a single owner per issue.

## Smallest schedule correction

- **Nov 4:** commit the docs. The 2–3 hour foundation comes out of lines already budgeted (`delivery-plan.md:19`, DB provisioning in `:25`, the Compose part of `:23`); say that those lines shrink by the same amount. The ≤1 hour CI comes out of contingency (4–6 h becomes 3–5 h).
- **Nov 5:** contract.
- **Nov 6:** finish the contract and start the indexer.
- **Sat Nov 7:** functional-core checkpoint (moved from Friday).
- **Sun Nov 8:** feature freeze.
- **Mon Nov 9:** submission, unchanged.

**Risk:** the plan budgets 32–44 hours against 30–36 available from Nov 4 to Nov 9 (`delivery-plan.md:9-11`). The upper end already exceeds the one-week cap, and Monday's buffer is now used up. Decide the cuts now:

1. the invariant suite;
2. the creation-time filters. They are a proposed extension (`sdd:136`) but sit in the mandatory budget (`delivery-plan.md:25`).

Running agents in parallel does not add review hours for the candidate.

## Issues (7)

| # | Title | Owner / reviewer | Depends on | Exit condition |
|---|---|---|---|---|
| 1 | Scaffold + Compose foundation | Codex / Claude | Docs commit | Pinned tools and lockfile; start/stop/reset/check commands; smoke checks pass, including the negative case; no business schema |
| 2 | Initial CI | Claude / Codex | 1 | `check` runs on push and PR; green on the pushed SHA; hardened as above |
| 3 | Escrow contract + Foundry tests | See split / other agent | 1 (scaffold); pause decision; explicit authorization | AC1–AC5, including −1/0/+1 boundaries, false-return and no-return tokens, reentrancy mocks; event ABI frozen; `forge test` in CI |
| 4 | Indexer, schema, recovery | Codex / Claude | 3 (events), 1, 2 | AC6–AC8 against real PostgreSQL and Anvil, in CI |
| 5 | Read API + health | Codex / Claude | 4 (schema) | AC9–AC10, including expiry without a recovery transaction and the 503 paths |
| 6 | One-command run + demo | Codex / Claude | 3–5 | AC11 from a clean clone; mines the delay blocks; all four outcomes verified through the API |
| 7 | Acceptance evidence + rehearsal | Candidate + Codex / Claude | 6 | AC12; every acceptance criterion cites a test or command; claims match the code |

**Not verified:** whether the pinned Anvil version has a dedicated reorg RPC (snapshot/revert is the safe fallback), and PDF pages 3–4, which I did not read.

Claude usage remaining:
- Current session: 98% remaining · resets Nov 4 at 1:30pm (America/Buenos_Aires)
- Current week (all models): 98% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
