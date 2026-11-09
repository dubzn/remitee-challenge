# Contract core implementation and evidence

Date: 2026-11-05. Candidate approved committing the design and implementing the core; design commit is `e924420`. This slice covers SDD AC1-AC5/C1-C10, not deployment, indexer or API. Pause/upgrades remain deferred.

## Delivered behavior and dependencies

`contracts/src/IEscrow.sol` implements the approved interface; `Escrow.sol` uses SafeERC20, checked uint64 conversion and one persistent reentrancy guard across all five mutations. Funding precedes record/ID creation. Resolution fixes the recipient from storage, sets terminal state before transfer, and rolls back on failure. No owner, proxy, pause, rescue, enumeration loop or separate withdrawal was added.

OpenZeppelin 5.7.0 is pinned to `cab19933c33c2ad1d4c7a84864a3601dddfd16f3`; forge-std 1.16.2 to `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`. Top-level gitlinks and `contracts/foundry.lock` record these revisions. Solidity 0.8.30/Cancun and Foundry 1.4.1 remain pinned. No third-party code was modified.

## Verification and checklist mapping

- **C1-C4:** 27 Codex tests cover exact funding, sequential IDs, failed creation, every domain error, missing IDs, wrong parties/third party/deployer, every terminal/action pair, first-success-wins and twelve deadline-boundary cases. Early acceptance and elapsed time without a transaction are explicit cases.
- **C5-C6:** 35 Claude candidate tests passed after Codex reviewed both files and executed them: no-return all four exits, false/reverting transfers, short/zero/excess/negative credit, rollback of finite allowances/supply/backing, ten reentry entry/callback combinations in swallowed/bubbled modes, second-token authorized targets, getter visibility and guard recovery. Each target is directly executable afterward, excluding false positives from role/time errors.
- **C7-C9:** representative multiple-ID/token/donation balances and event-only reconstruction agree with the getter. A large `1 << 200` amount is preserved; a uint64 deadline overflow fails before funding. Compiled storage shows `_lastEscrowId` at slot 0 and `_escrows` at slot 1; EscrowRecord occupies 160 bytes/five value slots, with timestamps/status at offsets 0/8/16/24 in its last slot. OpenZeppelin's persistent guard uses its separate namespaced slot. This is current inspection, not a proxy-layout promise or gas benchmark.
- **Local C10:** `forge test -vv` and `npm run contracts:check` passed **62 tests in three suites, zero failures/skips**. The Docker command also checks format/build, nonempty required suites, exactly the five approved nonpayable signatures, no fallback/receive, and compiled event ABI/indexing. It uses a read-only source mount, temporary workspace and a generated container cleaned in finally, without Anvil/DB/key access.
- `npm run check` passed the existing TypeScript and real Anvil/PostgreSQL foundation regression. The CI workflow now has a separate contracts job with pinned submodule checkout and the same Docker check command. Observed [CI run 41962697117](https://github.com/dubzn/remitee-challenge/actions/runs/41962697117) on implementation commit `558e65172e732c06ed22757d5084fd91dd7b00f3`: both foundation and contract jobs completed successfully. C1-C10 are complete; [issue #3](https://github.com/dubzn/remitee-challenge/issues/3) is closed with evidence. AC6-AC12 remain later submission work.

## Independent review and integration decisions

Claude changed only its two designated adversarial files and reported no core blockers. Preserve the [prompt](../claude/2026-11-05-contract-tests-prompt.md) and [unmodified response](../claude/2026-11-05-contract-tests-output.md). Codex inspected the complete files, formatted them, adjusted a view helper and removed unused mock metadata/naming lint; the tests were actually run afterward.

Accepted one small review refinement: the escrow's own address is explicitly InvalidToken, rather than failing later on a nonexistent balanceOf. The validation test covers it. A negative token balance delta reports non-negative received credit as zero and is rejected; a test proves prior backing survives the reverted attempt.

Keep the approved persistent ReentrancyGuard despite the v5.7 deprecation notice for a future v6 migration; the dependency is pinned and no transient-guard/storage-policy change is introduced for gas savings. Token-controlled revert bytes remain untrusted. Read callbacks can observe terminal state before payout returns; failed payout reverts that state and all effects.

No security audit or universal proof is claimed. Reentry's full callback matrix uses confirm as the outer payout; all four payout functions also receive a focused callback test. Extended fuzz/invariants, hostile token economics, pause/upgrades, deployment and AC6-AC12 remain outside this completed local core verification.
