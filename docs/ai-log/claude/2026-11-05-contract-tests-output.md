I wrote 35 candidate tests in two files, but I couldn't compile or run them (no shell), so they prove nothing until you run them. I found no blockers in the core contract.

Run them with `forge test --match-contract EscrowAdversarial -vvv`, then `forge fmt` on both files.

## Files changed
- `contracts/test/mocks/AdversarialTokens.sol` (new): three test-only tokens, all prefixed `Adv…`:
  - `AdvNoReturnToken`: `approve`, `transfer` and `transferFrom` return nothing; failures revert with the token's own errors.
  - `AdvModalToken`: an OpenZeppelin ERC20 whose deposit and payout transfers can each be set to Normal, ReturnFalse, Revert, ShortReceipt, NoCredit, ExcessReceipt or DebitRecipient.
  - `AdvReentrantToken`: an OpenZeppelin ERC20 with a one-shot hook that runs after any balance update touching the escrow. The hook can read `getEscrow(id)` and re-call the escrow; a failed re-call is either swallowed or re-thrown wrapped in `AdvReentrantToken_CallbackFailed(bytes)`.
- `contracts/test/EscrowAdversarial.t.sol` (new): a shared abstract base plus two test contracts, `EscrowAdversarialTokenTest` and `EscrowAdversarialReentrancyTest`.

Nothing else was touched, including the production source, `MockERC20`, config, lockfiles, CI and docs.

## Test cases
**`EscrowAdversarialTokenTest` (10 tests)**
- **No-return token:** funds four escrows and resolves all four outcomes, checking exact balances and that the allowance is fully used up. A short allowance fails with the token's own error, uses no ID, and a retry gets ID 1.
- **Failed deposits:** a false return fails with `SafeERC20FailedOperation(token)`. A reverting token's error comes through unchanged. Balances, allowance and total supply are rolled back, and a retry gets the unused ID. The false-return mode moves funds before returning false, which is the harder rollback case.
- **Failed payouts (false return and revert):** checked on all four resolution paths, including recovery after a time warp. The escrow stays Pending and its backing is unchanged. The same escrows resolve once the token behaves again.
- **Received amount wrong:** each case fails with `UnexpectedReceivedAmount` and the exact expected/received values:
  - a 1-unit shortfall, tested twice (fail, succeed as ID 1, fail, succeed as ID 2);
  - nothing received;
  - 1 unit too much;
  - the escrow's balance going down (reported as received = 0), while an earlier escrow keeps its backing and still pays in full.

**`EscrowAdversarialReentrancyTest` (25 tests)**
- **Setup:** the hostile token contract is a valid party on IDs 1–3, which use a second, normal token (`MockERC20`):
  - ID 1: it can recover;
  - ID 2: it can cancel;
  - ID 3: it is the beneficiary, so it can confirm or reject.
- **20-case table:** the five actions, called from the deposit callback and from the payout callback (a confirm), each with the failure swallowed and re-thrown. Each case checks:
  - the inner revert is exactly `ReentrancyGuardReentrantCall()`;
  - swallowed: the outer operation succeeds once, with one escrow event and one balance move, and none of IDs 1–3 change;
  - re-thrown: the outer operation fails with the wrapped guard error and fully rolls back;
  - in both modes, the same blocked action then succeeds when called directly at the same timestamp. That shows the guard is released and that it was the only thing blocking the call.
- **Five focused tests:**
  - all four payout paths are guarded, and each callback sees its own final status;
  - a nested deposit of the same hostile token (the classic double-credit attempt) is blocked;
  - re-entering to resolve the same ID a second time is blocked;
  - during the deposit callback, `getEscrow(nextId)` fails with `EscrowNotFound` even though the funds have already arrived;
  - during the payout callback the final status is already visible, and when that payout reverts the escrow is Pending again.

## Core review
**No blockers.** The checks match the agreed rules:
- **Callers:** the sender cancels and recovers; the beneficiary confirms and rejects.
- **Time:** cancel requires `t < cancelDeadline`, confirm and reject require `t < expiresAt`, recover requires `t >= expiresAt`.
- **Order of operations:** timestamps are range-checked before any token call; the received amount must match exactly; the status is set before the payout transfer; every action has the reentrancy guard.
- **Events:** each one names the right actor, and there is no admin path.

**Optional refinements:**
1. OpenZeppelin 5.7 marks the storage-based `ReentrancyGuard` as deprecated, to be replaced by `ReentrancyGuardTransient` in v6. Both use the same error, so these tests work with either. Either switch or note the choice.
2. Using the escrow's own address as the token reverts with empty data at `balanceOf`, not with `InvalidToken`. It is still safe; an explicit check would just give a clearer error.
3. When the escrow's balance goes down, the error reports `received = 0`, and my tests expect that. It's worth documenting.
4. `getEscrow` has no reentrancy guard, so a read during a payout shows the final status before the transfer returns. That is what the brief requires, and nothing inconsistent persists because a failed transfer reverts the whole transaction. If a read guard is ever added, two tests would see the guard error instead of `EscrowNotFound` and need updating.
5. Resolution events are emitted after the transfer. That's fine with the guard; no change needed.
6. Two suggestions for your own test slices:
   - Overflow test: warp to `type(uint64).max - ttl + 1` and expect `SafeCastOverflowedUintDowncast(64, 2**64)` before any token call.
   - ABI check: the compiled ABI will probably list the inherited and library errors (guard, SafeERC20, SafeCast) as well. Check against the actual artifact.

## Uncertainties
- **Untested assumptions:** that a `vm.expectRevert` followed by `vm.prank` is matched to the next real call, that event selectors can be read through the interface name, and that `forge fmt` accepts the layout.
- **Hook timing:** the hook only runs after the balance update. The guard runs before any function logic, so running it before the update should give the same result, but that variant isn't tested.
- **Payout coverage:** the 20-case table only uses confirm as the outer payout. Cancel, reject and recover only get the nested-deposit check, in the four-paths test.
- **State after a re-thrown failure:** that revert also rolls back the token's internal state, so the hook is still armed afterwards. The tests call `disarm()` before retrying for that reason.

Claude usage remaining:
- Current session: 73% remaining · resets Nov 5 at 3:40am (America/Buenos_Aires)
- Current week (all models): 95% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
