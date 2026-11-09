Finished reading the listed docs, `references.md` and PDF pages 1–2. Here is the review.

## Verdict: NEEDS_REVISION (small changes to the documents only)

The interface and storage are sound and proportional. The required changes are wording fixes and checklist gaps, not a redesign. This is advice for the candidate's review, not approval to implement.

## 1. Objectives vs. the challenge

C1–C10 match the rules on PDF pages 1–2: who can act, `t < 2h`, `t < 7d`, `t >= 7d`, no changes after a final state, amount/beneficiary validation, tokens that return no bool, the minimum event fields and the getter. They also match the accepted token policy (`sdd/escrow.md:88`). The only extras are the ones already documented: rejecting the contract itself as beneficiary, rejecting token addresses with no code, and checking the received amount.

**Required:**
- **Test every revert explicitly** (PDF p.2, "cada revert"). Add to C2/C3: each custom error has at least one test asserting its exact selector and arguments. Today this is implied, not stated.
- **Wrong-caller matrix** (`sdd/escrow.md:70`). Name a third party, the role swaps (beneficiary calling cancel/recover, sender calling confirm/reject) and the deployer, who has no special power (p.2, "ni siquiera el owner").
- **Check the public function list** (AC3 "interface review", `:53`). The compiled ABI's state-changing functions must be exactly the five actions. This makes "no admin escape path" checkable, and any later pause/upgrade addition must update this check on purpose.

**Optional (to keep the week proportional):**
- **C6 (`:73`):** the reentrancy guard works the same way on every entry point. One malicious token that re-enters each of the five functions, from both the deposit `transferFrom` and the payout `transfer`, is enough. The token should capture and assert the inner `ReentrancyGuardReentrantCall`, not just the outer revert; otherwise a test can pass for the wrong reason. "Cross-ID" doesn't need to be a separate axis.
- **C7 (`:74`):** a fixed scenario with several IDs and tokens is enough. A Foundry invariant handler stays optional. "No unbounded summation feature" is a design rule, not a test.
- **C8 (`:75`):** "no surviving event for a reverted action" is guaranteed by how the EVM works. Fold it into the log-count assertions in C1/C5.

## 2. Interface

What's sound: `msg.sender` is the sender, resolutions take only the ID, recipients are fixed, functions are nonpayable, and `EscrowCreated` indexes three fields (the maximum for a normal event). The challenge's field order is kept with `createdAt` added at the end. Existence is checked against the counter before the default zero value could be read as Pending.

**Required:**
- `contract-design.md:71` calls token and library reverts "attributable", which is misleading. SafeERC20 passes the token's revert data through unchanged, so a hostile token can revert with `EscrowNotFound`'s selector or any other. The doc should say that revert data from token calls is controlled by the token, and only reverts outside those calls can be attributed to the escrow.

**Optional:**
- `struct Escrow` (`:17`) clashes with a contract that would naturally be called `Escrow is IEscrow`. I haven't confirmed whether this is a warning or an error. Renaming it to `EscrowRecord` avoids the confusion.
- `AcceptanceWindowClosed` (`:61`) also fires on reject, so `DecisionWindowClosed` is more accurate.
- The `CANCELLATION_WINDOW()`/`ESCROW_TTL()` getters (`:36-37`) aren't needed, because the API never recomputes deadlines. They're harmless; keep them for tests and the demo, or drop them.
- `InvalidBeneficiary` covers three cases, but its address argument tells them apart. Acceptable.

## 3. Storage

A counter, a mapping and the inherited guard lock is the minimal correct state. The five-slot estimate is right: three addresses take one slot each, the uint256 amount takes one, and three uint64 timestamps plus the enum share the fifth (25 bytes).

**Required:** the reason given for storing deadlines (`:91`, "independent of later time-window code changes") is wrong. In a non-upgradeable contract with constants, the code can't change, so the sentence quietly argues for an upgrade benefit. A better reason: the time checks compare against exactly the values that were emitted and that the getter returns.

**uint64 vs. uint256:** I recommend keeping uint64 with SafeCast. It's the only option where storing three explicit timestamps costs no extra slot. With uint256 the record grows to about seven slots, roughly 44k more gas per creation. That's a side effect, not a goal. The cost is one checked conversion plus one test that warps time close to `type(uint64).max` (C9). uint256, with `status` packed next to `token`, is equally correct if the candidate prefers fewer things to defend. Don't pack further (for example, timestamps next to addresses); that would be optimizing gas for its own sake.

**C9 (`:76`):** for a non-upgradeable contract, only the ABI and event signatures need freezing, because the indexer depends on them. Reword C9 so the storage layout is informational unless a proxy is chosen later.

## 4. Upgrade and isolation claims

Nothing in the documents promises easy future upgrades; `:117` already says core approval doesn't make the contract safely upgradeable. Fixes:
- **`:91`:** as above.
- **`:104`:** "Tests establish that … balances cover" should become "tests check representative scenarios". Example-based tests don't prove a universal property.
- **Isolation wording:** add that isolation between different tokens doesn't depend on a hostile token behaving honestly, because each ID's token is fixed and every entry point is guarded. Backing within the same token does depend on it: a token that lies about `balanceOf` or transfers can fake or strand the backing of its own escrows. AC4's "under the supported token assumptions" (`:54`) is correctly qualified; this sentence makes it easier to explain.
- **Consistency:** the SDD Scope line "One non-upgradeable deployment" (`sdd/escrow.md:18`) and the "proxies" non-goal (`:26`) read as settled, while `:66` and `:87` say the upgrade decision is deferred. This doesn't promise upgradeability, but label them "current baseline, pending the deferred decision". This doesn't select pause or upgrade; it only keeps the documents consistent.

## Not verified

Nothing was compiled or run. These points come from my knowledge, not from checks:
- whether the struct-name clash is a warning or an error;
- whether a `public constant` can implement the interface getters;
- exact OpenZeppelin 5.x error names (no dependency is installed yet);
- SafeERC20 passing token revert data through in the pinned version;
- the gas figures.

I read only the files named in the request. I didn't check the one-week schedule's hours, and I didn't write a plan file, as instructed.

Claude usage remaining:
- Current session: 95% remaining · resets Nov 5 at 3:40am (America/Buenos_Aires)
- Current week (all models): 97% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
