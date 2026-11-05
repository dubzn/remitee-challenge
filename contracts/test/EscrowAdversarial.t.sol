// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Escrow} from "../src/Escrow.sol";
import {IEscrow} from "../src/IEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {AdvModalToken, AdvNoReturnToken, AdvReentrantToken} from "./mocks/AdversarialTokens.sol";

/// @dev Shared actors and helpers. Abstract, so Foundry does not run it directly.
abstract contract EscrowAdversarialBase is Test {
    uint256 internal constant AMOUNT = 100e18;
    uint256 internal constant T0 = 1_000_000;

    Escrow internal escrow;
    address internal alice;
    address internal bob;
    uint256 internal ttl;

    function setUp() public virtual {
        vm.warp(T0);
        escrow = new Escrow();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        ttl = escrow.ESCROW_TTL();
    }

    function _create(address sender, address beneficiary, address token, uint256 amount) internal returns (uint256) {
        vm.prank(sender);
        return escrow.createEscrow(beneficiary, token, amount);
    }

    function _assertNotFound(uint256 id) internal {
        vm.expectRevert(abi.encodeWithSelector(IEscrow.EscrowNotFound.selector, id));
        escrow.getEscrow(id);
    }

    function _assertStatus(uint256 id, IEscrow.Status expected) internal view {
        assertEq(uint256(escrow.getEscrow(id).status), uint256(expected), "status");
    }

    function _assertBalances(address token, uint256 aliceBalance, uint256 bobBalance, uint256 escrowBalance)
        internal
        view
    {
        assertEq(IERC20(token).balanceOf(alice), aliceBalance, "alice balance");
        assertEq(IERC20(token).balanceOf(bob), bobBalance, "bob balance");
        assertEq(IERC20(token).balanceOf(address(escrow)), escrowBalance, "escrow balance");
    }

    /// @dev Reads the recorded logs; requires a preceding vm.recordLogs().
    function _assertSingleEscrowEvent(bytes32 expectedTopic0) internal view {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 count;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(escrow)) {
                count++;
                assertEq(logs[i].topics[0], expectedTopic0, "escrow event topic");
            }
        }
        assertEq(count, 1, "escrow event count");
    }
}

/// @notice C5 token behavior and rollback: no-return tokens, false/reverting transfers and
/// received-delta mismatches. Expected errors are exact, including selected library errors.
contract EscrowAdversarialTokenTest is EscrowAdversarialBase {
    uint256 internal constant SUPPLY = 10 * AMOUNT;

    AdvNoReturnToken internal noReturn;
    AdvModalToken internal modal;

    function setUp() public override {
        super.setUp();
        noReturn = new AdvNoReturnToken();
        modal = new AdvModalToken();
        noReturn.mint(alice, SUPPLY);
        modal.mint(alice, SUPPLY);
        vm.prank(alice);
        modal.approve(address(escrow), SUPPLY);
        // The no-return allowance is set per test so exact consumption is visible.
    }

    // ---------------------------------------------------------------------
    // No-return token
    // ---------------------------------------------------------------------

    function test_NoReturnToken_FundsAndResolvesAllFourOutcomes() public {
        address token = address(noReturn);
        vm.prank(alice);
        noReturn.approve(address(escrow), 4 * AMOUNT);

        uint256 idCancel = _create(alice, bob, token, AMOUNT);
        uint256 idConfirm = _create(alice, bob, token, AMOUNT);
        uint256 idReject = _create(alice, bob, token, AMOUNT);
        uint256 idRecover = _create(alice, bob, token, AMOUNT);
        assertEq(idCancel, 1);
        assertEq(idConfirm, 2);
        assertEq(idReject, 3);
        assertEq(idRecover, 4);
        assertEq(noReturn.allowance(alice, address(escrow)), 0, "allowance consumed exactly");
        _assertBalances(token, SUPPLY - 4 * AMOUNT, 0, 4 * AMOUNT);

        vm.prank(alice);
        escrow.cancelEscrow(idCancel);
        _assertStatus(idCancel, IEscrow.Status.CancelledBySender);
        _assertBalances(token, SUPPLY - 3 * AMOUNT, 0, 3 * AMOUNT);

        vm.prank(bob);
        escrow.confirmEscrow(idConfirm);
        _assertStatus(idConfirm, IEscrow.Status.Released);
        _assertBalances(token, SUPPLY - 3 * AMOUNT, AMOUNT, 2 * AMOUNT);

        vm.prank(bob);
        escrow.rejectEscrow(idReject);
        _assertStatus(idReject, IEscrow.Status.Rejected);
        _assertBalances(token, SUPPLY - 2 * AMOUNT, AMOUNT, AMOUNT);

        vm.warp(T0 + ttl);
        vm.prank(alice);
        escrow.recoverExpiredEscrow(idRecover);
        _assertStatus(idRecover, IEscrow.Status.Expired);
        _assertBalances(token, SUPPLY - AMOUNT, AMOUNT, 0);
    }

    function test_NoReturnToken_FailedDepositBubblesTokenErrorAndConsumesNoId() public {
        address token = address(noReturn);
        vm.prank(alice);
        noReturn.approve(address(escrow), AMOUNT - 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                AdvNoReturnToken.AdvNoReturnToken_InsufficientAllowance.selector,
                alice,
                address(escrow),
                AMOUNT - 1,
                AMOUNT
            )
        );
        escrow.createEscrow(bob, token, AMOUNT);

        _assertNotFound(1);
        assertEq(noReturn.allowance(alice, address(escrow)), AMOUNT - 1, "allowance unchanged");
        _assertBalances(token, SUPPLY, 0, 0);

        vm.prank(alice);
        noReturn.approve(address(escrow), AMOUNT);
        assertEq(_create(alice, bob, token, AMOUNT), 1, "first successful ID is still 1");
        _assertBalances(token, SUPPLY - AMOUNT, 0, AMOUNT);
    }

    // ---------------------------------------------------------------------
    // False-return / reverting deposit
    // ---------------------------------------------------------------------

    function test_DepositReturningFalse_RevertsWithSafeERC20ErrorAndRollsBack() public {
        _assertDepositFailureRollsBack(
            AdvModalToken.Mode.ReturnFalse,
            0,
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(modal)),
            1
        );
    }

    function test_DepositReverting_BubblesTokenErrorAndRollsBack() public {
        _assertDepositFailureRollsBack(
            AdvModalToken.Mode.Revert,
            0,
            abi.encodeWithSelector(AdvModalToken.AdvModalToken_ForcedRevert.selector, alice, address(escrow), AMOUNT),
            1
        );
    }

    // ---------------------------------------------------------------------
    // False-return / reverting payout on every resolution path
    // ---------------------------------------------------------------------

    function test_PayoutReturningFalse_KeepsEveryPathPendingUntilTokenRecovers() public {
        _assertPayoutFailuresRollBack(AdvModalToken.Mode.ReturnFalse);
    }

    function test_PayoutReverting_KeepsEveryPathPendingUntilTokenRecovers() public {
        _assertPayoutFailuresRollBack(AdvModalToken.Mode.Revert);
    }

    // ---------------------------------------------------------------------
    // Received-delta mismatch
    // ---------------------------------------------------------------------

    function test_ShortReceipt_OneUnitShortfallRejectsCreationAndRetriesStillWork() public {
        bytes memory expected = abi.encodeWithSelector(IEscrow.UnexpectedReceivedAmount.selector, AMOUNT, AMOUNT - 1);
        // Failure, then success at ID 1.
        _assertDepositFailureRollsBack(AdvModalToken.Mode.ShortReceipt, 1, expected, 1);
        // A repeated failure after a success still consumes nothing; the next success is ID 2.
        _assertDepositFailureRollsBack(AdvModalToken.Mode.ShortReceipt, 1, expected, 2);
    }

    function test_ZeroCredit_RejectsCreation() public {
        _assertDepositFailureRollsBack(
            AdvModalToken.Mode.NoCredit,
            0,
            abi.encodeWithSelector(IEscrow.UnexpectedReceivedAmount.selector, AMOUNT, 0),
            1
        );
    }

    function test_ExcessCredit_RejectsCreation() public {
        _assertDepositFailureRollsBack(
            AdvModalToken.Mode.ExcessReceipt,
            1,
            abi.encodeWithSelector(IEscrow.UnexpectedReceivedAmount.selector, AMOUNT, AMOUNT + 1),
            1
        );
    }

    function test_NegativeCredit_RejectsCreationAndPreservesExistingBacking() public {
        uint256 existingId = _create(alice, bob, address(modal), AMOUNT);
        assertEq(existingId, 1);

        // The escrow balance decreases during the deposit; the contract reports received = 0.
        _assertDepositFailureRollsBack(
            AdvModalToken.Mode.DebitRecipient,
            1,
            abi.encodeWithSelector(IEscrow.UnexpectedReceivedAmount.selector, AMOUNT, 0),
            2
        );

        // The earlier escrow's backing survived the failed attempt and still pays out in full.
        uint256 bobBefore = modal.balanceOf(bob);
        vm.prank(bob);
        escrow.confirmEscrow(existingId);
        assertEq(modal.balanceOf(bob), bobBefore + AMOUNT, "existing escrow paid in full");
        assertEq(modal.balanceOf(address(escrow)), AMOUNT, "escrow 2 still fully backed");
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /// @dev Expects one failed deposit, verifies full rollback, then shows that an honest retry takes
    /// `expectedNextId` (i.e. the failure consumed no ID).
    function _assertDepositFailureRollsBack(
        AdvModalToken.Mode failure,
        uint256 param,
        bytes memory expectedRevert,
        uint256 expectedNextId
    ) internal {
        modal.setModes(AdvModalToken.Mode.Normal, failure, param);
        uint256 aliceBefore = modal.balanceOf(alice);
        uint256 allowanceBefore = modal.allowance(alice, address(escrow));
        uint256 escrowBefore = modal.balanceOf(address(escrow));
        uint256 supplyBefore = modal.totalSupply();

        vm.prank(alice);
        vm.expectRevert(expectedRevert);
        escrow.createEscrow(bob, address(modal), AMOUNT);

        _assertNotFound(expectedNextId);
        assertEq(modal.balanceOf(alice), aliceBefore, "sender balance rolled back");
        assertEq(modal.allowance(alice, address(escrow)), allowanceBefore, "allowance rolled back");
        assertEq(modal.balanceOf(address(escrow)), escrowBefore, "escrow balance rolled back");
        assertEq(modal.totalSupply(), supplyBefore, "supply rolled back");

        modal.setModes(AdvModalToken.Mode.Normal, AdvModalToken.Mode.Normal, 0);
        assertEq(_create(alice, bob, address(modal), AMOUNT), expectedNextId, "unconsumed ID reused");
        assertEq(modal.balanceOf(address(escrow)), escrowBefore + AMOUNT);
        assertEq(modal.allowance(alice, address(escrow)), allowanceBefore - AMOUNT);
    }

    function _assertPayoutFailuresRollBack(AdvModalToken.Mode failure) internal {
        address token = address(modal);
        uint256 idCancel = _create(alice, bob, token, AMOUNT);
        uint256 idConfirm = _create(alice, bob, token, AMOUNT);
        uint256 idReject = _create(alice, bob, token, AMOUNT);
        uint256 idRecover = _create(alice, bob, token, AMOUNT);
        uint256 aliceFunded = SUPPLY - 4 * AMOUNT;
        _assertBalances(token, aliceFunded, 0, 4 * AMOUNT);

        // Paths available before the cancellation deadline.
        modal.setModes(failure, AdvModalToken.Mode.Normal, 0);

        _expectPayoutFailure(failure, alice);
        vm.prank(alice);
        escrow.cancelEscrow(idCancel);

        _expectPayoutFailure(failure, bob);
        vm.prank(bob);
        escrow.confirmEscrow(idConfirm);

        _expectPayoutFailure(failure, alice);
        vm.prank(bob);
        escrow.rejectEscrow(idReject);

        _assertStatus(idCancel, IEscrow.Status.Pending);
        _assertStatus(idConfirm, IEscrow.Status.Pending);
        _assertStatus(idReject, IEscrow.Status.Pending);
        _assertBalances(token, aliceFunded, 0, 4 * AMOUNT);

        // The same escrows remain resolvable once the token behaves again.
        modal.setModes(AdvModalToken.Mode.Normal, AdvModalToken.Mode.Normal, 0);
        vm.prank(alice);
        escrow.cancelEscrow(idCancel);
        vm.prank(bob);
        escrow.confirmEscrow(idConfirm);
        vm.prank(bob);
        escrow.rejectEscrow(idReject);
        _assertStatus(idCancel, IEscrow.Status.CancelledBySender);
        _assertStatus(idConfirm, IEscrow.Status.Released);
        _assertStatus(idReject, IEscrow.Status.Rejected);
        _assertBalances(token, aliceFunded + 2 * AMOUNT, AMOUNT, AMOUNT);

        // Recovery path after expiry.
        vm.warp(T0 + ttl);
        modal.setModes(failure, AdvModalToken.Mode.Normal, 0);
        _expectPayoutFailure(failure, alice);
        vm.prank(alice);
        escrow.recoverExpiredEscrow(idRecover);
        _assertStatus(idRecover, IEscrow.Status.Pending);
        _assertBalances(token, aliceFunded + 2 * AMOUNT, AMOUNT, AMOUNT);

        modal.setModes(AdvModalToken.Mode.Normal, AdvModalToken.Mode.Normal, 0);
        vm.prank(alice);
        escrow.recoverExpiredEscrow(idRecover);
        _assertStatus(idRecover, IEscrow.Status.Expired);
        _assertBalances(token, aliceFunded + 3 * AMOUNT, AMOUNT, 0);
    }

    function _expectPayoutFailure(AdvModalToken.Mode failure, address recipient) internal {
        if (failure == AdvModalToken.Mode.ReturnFalse) {
            vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(modal)));
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(
                    AdvModalToken.AdvModalToken_ForcedRevert.selector, address(escrow), recipient, AMOUNT
                )
            );
        }
    }
}

/// @notice C6 reentrancy: a hostile token attempts each of the five mutating entry points from both
/// its deposit and payout callbacks. Targets are other IDs on a supported second token in which the
/// hostile token contract is an authorized party at the current timestamp, so the guard is the only
/// thing blocking them; each case proves that by executing the same call directly afterwards.
contract EscrowAdversarialReentrancyTest is EscrowAdversarialBase {
    enum Target {
        Create,
        Cancel,
        Confirm,
        Reject,
        Recover
    }

    struct TargetSnapshot {
        uint256 hostileSecond;
        uint256 carolSecond;
        uint256 escrowSecond;
        IEscrow.Status recoverStatus;
        IEscrow.Status cancelStatus;
        IEscrow.Status decisionStatus;
    }

    struct OuterSnapshot {
        uint256 aliceBalance;
        uint256 bobBalance;
        uint256 escrowBalance;
        uint256 aliceAllowance;
    }

    uint256 internal constant TARGET_AMOUNT = 7e18;
    uint256 internal constant FIRST_OUTER_ID = 4;

    AdvReentrantToken internal hostile;
    MockERC20 internal second;
    address internal carol;
    address internal hostileActor;
    uint256 internal t1;

    uint256 internal recoverTargetId;
    uint256 internal cancelTargetId;
    uint256 internal decisionTargetId;

    function setUp() public override {
        super.setUp();
        carol = makeAddr("carol");
        hostile = new AdvReentrantToken(address(escrow));
        second = new MockERC20();
        hostileActor = address(hostile);

        hostile.mint(alice, 10 * AMOUNT);
        vm.prank(alice);
        hostile.approve(address(escrow), 10 * AMOUNT);

        second.mint(hostileActor, 10 * TARGET_AMOUNT);
        second.mint(carol, 10 * TARGET_AMOUNT);
        vm.prank(hostileActor);
        second.approve(address(escrow), type(uint256).max);
        vm.prank(carol);
        second.approve(address(escrow), type(uint256).max);

        // ID 1 (second token): hostile actor is sender; recoverable from T1 = T0 + TTL.
        recoverTargetId = _create(hostileActor, carol, address(second), TARGET_AMOUNT);
        t1 = T0 + ttl;
        vm.warp(t1);
        // ID 2 (second token): hostile actor is sender; cancellable until T1 + 2h.
        cancelTargetId = _create(hostileActor, carol, address(second), TARGET_AMOUNT);
        // ID 3 (second token): hostile actor is beneficiary; confirmable/rejectable until T1 + TTL.
        decisionTargetId = _create(carol, hostileActor, address(second), TARGET_AMOUNT);

        assertEq(recoverTargetId, 1);
        assertEq(cancelTargetId, 2);
        assertEq(decisionTargetId, 3);
    }

    // ---------------------------------------------------------------------
    // Ten-case table: deposit callback x five entry points, swallowed and bubbled
    // ---------------------------------------------------------------------

    function test_DepositReentry_CreateEscrow_Swallowed() public {
        _runDepositCase(Target.Create, false);
    }

    function test_DepositReentry_CreateEscrow_Bubbled() public {
        _runDepositCase(Target.Create, true);
    }

    function test_DepositReentry_CancelEscrow_Swallowed() public {
        _runDepositCase(Target.Cancel, false);
    }

    function test_DepositReentry_CancelEscrow_Bubbled() public {
        _runDepositCase(Target.Cancel, true);
    }

    function test_DepositReentry_ConfirmEscrow_Swallowed() public {
        _runDepositCase(Target.Confirm, false);
    }

    function test_DepositReentry_ConfirmEscrow_Bubbled() public {
        _runDepositCase(Target.Confirm, true);
    }

    function test_DepositReentry_RejectEscrow_Swallowed() public {
        _runDepositCase(Target.Reject, false);
    }

    function test_DepositReentry_RejectEscrow_Bubbled() public {
        _runDepositCase(Target.Reject, true);
    }

    function test_DepositReentry_RecoverExpiredEscrow_Swallowed() public {
        _runDepositCase(Target.Recover, false);
    }

    function test_DepositReentry_RecoverExpiredEscrow_Bubbled() public {
        _runDepositCase(Target.Recover, true);
    }

    // ---------------------------------------------------------------------
    // Ten-case table: payout callback (confirm) x five entry points, swallowed and bubbled
    // ---------------------------------------------------------------------

    function test_PayoutReentry_CreateEscrow_Swallowed() public {
        _runPayoutCase(Target.Create, false);
    }

    function test_PayoutReentry_CreateEscrow_Bubbled() public {
        _runPayoutCase(Target.Create, true);
    }

    function test_PayoutReentry_CancelEscrow_Swallowed() public {
        _runPayoutCase(Target.Cancel, false);
    }

    function test_PayoutReentry_CancelEscrow_Bubbled() public {
        _runPayoutCase(Target.Cancel, true);
    }

    function test_PayoutReentry_ConfirmEscrow_Swallowed() public {
        _runPayoutCase(Target.Confirm, false);
    }

    function test_PayoutReentry_ConfirmEscrow_Bubbled() public {
        _runPayoutCase(Target.Confirm, true);
    }

    function test_PayoutReentry_RejectEscrow_Swallowed() public {
        _runPayoutCase(Target.Reject, false);
    }

    function test_PayoutReentry_RejectEscrow_Bubbled() public {
        _runPayoutCase(Target.Reject, true);
    }

    function test_PayoutReentry_RecoverExpiredEscrow_Swallowed() public {
        _runPayoutCase(Target.Recover, false);
    }

    function test_PayoutReentry_RecoverExpiredEscrow_Bubbled() public {
        _runPayoutCase(Target.Recover, true);
    }

    // ---------------------------------------------------------------------
    // Focused scenarios
    // ---------------------------------------------------------------------

    /// @dev All four resolution paths reach the guarded payout; each sees its terminal status in the
    /// callback and pays its fixed recipient exactly once.
    function test_PayoutCallback_AllFourResolutionPathsAreGuarded() public {
        address token = address(hostile);
        uint256 idCancel = _create(alice, bob, token, AMOUNT);
        uint256 idConfirm = _create(alice, bob, token, AMOUNT);
        uint256 idReject = _create(alice, bob, token, AMOUNT);
        uint256 idRecover = _create(alice, bob, token, AMOUNT);
        uint256 aliceFunded = hostile.balanceOf(alice);
        uint256 hostileSecondBefore = second.balanceOf(hostileActor);
        bytes memory nestedCreate = _reentryCalldata(Target.Create);

        hostile.armWithProbe(nestedCreate, false, idCancel, false);
        vm.prank(alice);
        escrow.cancelEscrow(idCancel);
        _assertSwallowedPayout(idCancel, IEscrow.Status.CancelledBySender);

        hostile.armWithProbe(nestedCreate, false, idConfirm, false);
        vm.prank(bob);
        escrow.confirmEscrow(idConfirm);
        _assertSwallowedPayout(idConfirm, IEscrow.Status.Released);

        hostile.armWithProbe(nestedCreate, false, idReject, false);
        vm.prank(bob);
        escrow.rejectEscrow(idReject);
        _assertSwallowedPayout(idReject, IEscrow.Status.Rejected);

        vm.warp(t1 + ttl);
        hostile.armWithProbe(nestedCreate, false, idRecover, false);
        vm.prank(alice);
        escrow.recoverExpiredEscrow(idRecover);
        _assertSwallowedPayout(idRecover, IEscrow.Status.Expired);

        _assertBalances(token, aliceFunded + 3 * AMOUNT, AMOUNT, 0);
        assertEq(second.balanceOf(hostileActor), hostileSecondBefore, "no nested create succeeded");
        _assertNotFound(idRecover + 1);
    }

    /// @dev Classic double-credit attempt: a nested deposit of the same hostile token during the
    /// outer deposit callback. Exactly one escrow is created and backed.
    function test_DepositCallback_NestedSameTokenDepositIsBlocked() public {
        hostile.mint(hostileActor, AMOUNT);
        vm.prank(hostileActor);
        hostile.approve(address(escrow), AMOUNT);
        uint256 actorBefore = hostile.balanceOf(hostileActor);

        hostile.arm(abi.encodeCall(IEscrow.createEscrow, (carol, address(hostile), AMOUNT)), false);
        vm.recordLogs();
        vm.prank(alice);
        uint256 id = escrow.createEscrow(bob, address(hostile), AMOUNT);
        _assertSingleEscrowEvent(IEscrow.EscrowCreated.selector);

        assertEq(id, FIRST_OUTER_ID);
        _assertGuardBlockedReentry();
        assertEq(hostile.balanceOf(address(escrow)), AMOUNT, "exactly one deposit held");
        assertEq(hostile.balanceOf(hostileActor), actorBefore, "nested deposit did not move funds");
        assertEq(hostile.allowance(hostileActor, address(escrow)), AMOUNT, "nested allowance unspent");
        _assertNotFound(FIRST_OUTER_ID + 1);
    }

    /// @dev The authorized beneficiary re-enters to resolve the same ID a second time during payout.
    function test_PayoutCallback_SameIdSecondResolutionIsBlocked() public {
        uint256 id = _create(alice, hostileActor, address(hostile), AMOUNT);
        uint256 actorBefore = hostile.balanceOf(hostileActor);

        hostile.arm(abi.encodeCall(IEscrow.confirmEscrow, (id)), false);
        vm.recordLogs();
        vm.prank(hostileActor);
        escrow.confirmEscrow(id);
        _assertSingleEscrowEvent(IEscrow.EscrowReleased.selector);

        _assertGuardBlockedReentry();
        _assertStatus(id, IEscrow.Status.Released);
        assertEq(hostile.balanceOf(hostileActor), actorBefore + AMOUNT, "paid exactly once");
        assertEq(hostile.balanceOf(address(escrow)), 0, "no residual or double debit");
    }

    /// @dev During the deposit callback the funds have already arrived, yet the future ID is not
    /// readable. The callback reverts with what it saw, which also rolls the creation back.
    function test_DepositCallback_FutureIdGetterRevertsInsteadOfExposingPending() public {
        OuterSnapshot memory before = _outerSnapshot();
        hostile.armWithProbe("", false, FIRST_OUTER_ID, true);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                AdvReentrantToken.AdvReentrantToken_ProbeResult.selector,
                false,
                abi.encodeWithSelector(IEscrow.EscrowNotFound.selector, FIRST_OUTER_ID)
            )
        );
        escrow.createEscrow(bob, address(hostile), AMOUNT);

        _assertNotFound(FIRST_OUTER_ID);
        _assertOuterUnchanged(before);
    }

    /// @dev During the payout callback the terminal status is already stored. When the payout then
    /// reverts, the escrow is Pending again with its backing intact and can still be resolved.
    function test_PayoutCallback_TerminalStateVisibleAndRevertRestoresPending() public {
        uint256 id = _create(alice, bob, address(hostile), AMOUNT);
        IEscrow.EscrowRecord memory expectedSeen = escrow.getEscrow(id);
        expectedSeen.status = IEscrow.Status.Released;
        OuterSnapshot memory before = _outerSnapshot();

        hostile.armWithProbe("", false, id, true);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                AdvReentrantToken.AdvReentrantToken_ProbeResult.selector, true, abi.encode(expectedSeen)
            )
        );
        escrow.confirmEscrow(id);

        _assertStatus(id, IEscrow.Status.Pending);
        _assertOuterUnchanged(before);

        hostile.disarm();
        vm.prank(bob);
        escrow.confirmEscrow(id);
        _assertStatus(id, IEscrow.Status.Released);
        assertEq(hostile.balanceOf(bob), before.bobBalance + AMOUNT);
    }

    // ---------------------------------------------------------------------
    // Case runners
    // ---------------------------------------------------------------------

    function _runDepositCase(Target target, bool bubble) internal {
        uint256 outerId = FIRST_OUTER_ID;
        TargetSnapshot memory targetsBefore = _targetSnapshot();
        OuterSnapshot memory outerBefore = _outerSnapshot();

        hostile.armWithProbe(_reentryCalldata(target), bubble, outerId, false);

        if (bubble) {
            vm.prank(alice);
            vm.expectRevert(_wrappedGuardError());
            escrow.createEscrow(bob, address(hostile), AMOUNT);

            _assertNotFound(outerId);
            _assertOuterUnchanged(outerBefore);
            _assertTargetsUnchanged(targetsBefore);

            // The revert also rolled back the token's one-shot disarm; disarm before the honest retry.
            hostile.disarm();
            vm.prank(alice);
            assertEq(escrow.createEscrow(bob, address(hostile), AMOUNT), outerId, "ID not consumed by revert");
        } else {
            vm.recordLogs();
            vm.prank(alice);
            uint256 id = escrow.createEscrow(bob, address(hostile), AMOUNT);
            _assertSingleEscrowEvent(IEscrow.EscrowCreated.selector);

            assertEq(id, outerId);
            assertEq(hostile.hookRuns(), 1, "hook ran once");
            _assertGuardBlockedReentry();
            // Funds were already credited when the probe ran, but no record was exposed.
            assertFalse(hostile.probeSucceeded(), "future ID must not be readable");
            assertEq(hostile.probeReturnData(), abi.encodeWithSelector(IEscrow.EscrowNotFound.selector, outerId));
            _assertTargetsUnchanged(targetsBefore);
        }

        _assertOuterFunded(outerBefore, outerId);
        _assertNotFound(outerId + 1);
        // The guard is released and the blocked action was otherwise valid at this timestamp.
        _executeTargetDirectly(target, outerId + 1);
    }

    function _runPayoutCase(Target target, bool bubble) internal {
        uint256 outerId = _create(alice, bob, address(hostile), AMOUNT);
        assertEq(outerId, FIRST_OUTER_ID);
        TargetSnapshot memory targetsBefore = _targetSnapshot();
        OuterSnapshot memory outerBefore = _outerSnapshot();

        hostile.armWithProbe(_reentryCalldata(target), bubble, outerId, false);

        if (bubble) {
            vm.prank(bob);
            vm.expectRevert(_wrappedGuardError());
            escrow.confirmEscrow(outerId);

            _assertStatus(outerId, IEscrow.Status.Pending);
            _assertOuterUnchanged(outerBefore);
            _assertTargetsUnchanged(targetsBefore);

            hostile.disarm();
            vm.prank(bob);
            escrow.confirmEscrow(outerId);
        } else {
            vm.recordLogs();
            vm.prank(bob);
            escrow.confirmEscrow(outerId);
            _assertSingleEscrowEvent(IEscrow.EscrowReleased.selector);

            assertEq(hostile.hookRuns(), 1, "hook ran once");
            _assertGuardBlockedReentry();
            assertTrue(hostile.probeSucceeded(), "existing ID readable during payout");
            IEscrow.EscrowRecord memory seen = abi.decode(hostile.probeReturnData(), (IEscrow.EscrowRecord));
            assertEq(uint256(seen.status), uint256(IEscrow.Status.Released), "terminal before transfer returns");
            _assertTargetsUnchanged(targetsBefore);
        }

        // Exactly one payout to the fixed recipient in either mode.
        _assertStatus(outerId, IEscrow.Status.Released);
        assertEq(hostile.balanceOf(bob), outerBefore.bobBalance + AMOUNT, "beneficiary paid once");
        assertEq(hostile.balanceOf(alice), outerBefore.aliceBalance, "sender untouched");
        assertEq(hostile.balanceOf(address(escrow)), outerBefore.escrowBalance - AMOUNT, "escrow debited once");
        _assertNotFound(outerId + 1);
        _executeTargetDirectly(target, outerId + 1);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _guardError() internal pure returns (bytes memory) {
        return abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function _wrappedGuardError() internal pure returns (bytes memory) {
        return abi.encodeWithSelector(AdvReentrantToken.AdvReentrantToken_CallbackFailed.selector, _guardError());
    }

    function _assertGuardBlockedReentry() internal view {
        assertTrue(hostile.reentryAttempted(), "reentry attempted");
        assertFalse(hostile.reentrySucceeded(), "reentry must fail");
        assertEq(hostile.reentryReturnData(), _guardError(), "inner revert is the guard error");
    }

    function _assertSwallowedPayout(uint256 id, IEscrow.Status expected) internal view {
        assertEq(hostile.hookRuns(), 1, "hook ran once");
        _assertGuardBlockedReentry();
        assertTrue(hostile.probeSucceeded());
        IEscrow.EscrowRecord memory seen = abi.decode(hostile.probeReturnData(), (IEscrow.EscrowRecord));
        assertEq(uint256(seen.status), uint256(expected), "terminal status visible in callback");
        _assertStatus(id, expected);
    }

    function _reentryCalldata(Target target) internal view returns (bytes memory) {
        if (target == Target.Create) {
            return abi.encodeCall(IEscrow.createEscrow, (carol, address(second), TARGET_AMOUNT));
        }
        if (target == Target.Cancel) return abi.encodeCall(IEscrow.cancelEscrow, (cancelTargetId));
        if (target == Target.Confirm) return abi.encodeCall(IEscrow.confirmEscrow, (decisionTargetId));
        if (target == Target.Reject) return abi.encodeCall(IEscrow.rejectEscrow, (decisionTargetId));
        return abi.encodeCall(IEscrow.recoverExpiredEscrow, (recoverTargetId));
    }

    function _targetSnapshot() internal view returns (TargetSnapshot memory s) {
        s.hostileSecond = second.balanceOf(hostileActor);
        s.carolSecond = second.balanceOf(carol);
        s.escrowSecond = second.balanceOf(address(escrow));
        s.recoverStatus = escrow.getEscrow(recoverTargetId).status;
        s.cancelStatus = escrow.getEscrow(cancelTargetId).status;
        s.decisionStatus = escrow.getEscrow(decisionTargetId).status;
    }

    function _assertTargetsUnchanged(TargetSnapshot memory s) internal view {
        TargetSnapshot memory nowS = _targetSnapshot();
        assertEq(nowS.hostileSecond, s.hostileSecond, "target: hostile actor second-token balance");
        assertEq(nowS.carolSecond, s.carolSecond, "target: carol second-token balance");
        assertEq(nowS.escrowSecond, s.escrowSecond, "target: escrow second-token balance");
        assertEq(uint256(nowS.recoverStatus), uint256(s.recoverStatus), "target: recover status");
        assertEq(uint256(nowS.cancelStatus), uint256(s.cancelStatus), "target: cancel status");
        assertEq(uint256(nowS.decisionStatus), uint256(s.decisionStatus), "target: decision status");
    }

    function _outerSnapshot() internal view returns (OuterSnapshot memory s) {
        s.aliceBalance = hostile.balanceOf(alice);
        s.bobBalance = hostile.balanceOf(bob);
        s.escrowBalance = hostile.balanceOf(address(escrow));
        s.aliceAllowance = hostile.allowance(alice, address(escrow));
    }

    function _assertOuterUnchanged(OuterSnapshot memory s) internal view {
        assertEq(hostile.balanceOf(alice), s.aliceBalance, "outer: sender balance");
        assertEq(hostile.balanceOf(bob), s.bobBalance, "outer: beneficiary balance");
        assertEq(hostile.balanceOf(address(escrow)), s.escrowBalance, "outer: escrow balance");
        assertEq(hostile.allowance(alice, address(escrow)), s.aliceAllowance, "outer: allowance");
    }

    function _assertOuterFunded(OuterSnapshot memory s, uint256 id) internal view {
        assertEq(hostile.balanceOf(alice), s.aliceBalance - AMOUNT, "outer: sender debited once");
        assertEq(hostile.balanceOf(address(escrow)), s.escrowBalance + AMOUNT, "outer: escrow credited once");
        assertEq(hostile.allowance(alice, address(escrow)), s.aliceAllowance - AMOUNT, "outer: allowance spent once");
        IEscrow.EscrowRecord memory record = escrow.getEscrow(id);
        assertEq(record.sender, alice);
        assertEq(record.beneficiary, bob);
        assertEq(record.token, address(hostile));
        assertEq(record.amount, AMOUNT);
        assertEq(uint256(record.createdAt), t1);
        assertEq(uint256(record.status), uint256(IEscrow.Status.Pending));
    }

    /// @dev Executes the previously blocked call directly from the same actor at the same timestamp.
    function _executeTargetDirectly(Target target, uint256 expectedNewId) internal {
        uint256 hostileBefore = second.balanceOf(hostileActor);
        uint256 carolBefore = second.balanceOf(carol);

        if (target == Target.Create) {
            vm.prank(hostileActor);
            uint256 id = escrow.createEscrow(carol, address(second), TARGET_AMOUNT);
            assertEq(id, expectedNewId, "direct create takes the next ID");
            assertEq(second.balanceOf(hostileActor), hostileBefore - TARGET_AMOUNT);
        } else if (target == Target.Cancel) {
            vm.prank(hostileActor);
            escrow.cancelEscrow(cancelTargetId);
            _assertStatus(cancelTargetId, IEscrow.Status.CancelledBySender);
            assertEq(second.balanceOf(hostileActor), hostileBefore + TARGET_AMOUNT);
        } else if (target == Target.Confirm) {
            vm.prank(hostileActor);
            escrow.confirmEscrow(decisionTargetId);
            _assertStatus(decisionTargetId, IEscrow.Status.Released);
            assertEq(second.balanceOf(hostileActor), hostileBefore + TARGET_AMOUNT);
        } else if (target == Target.Reject) {
            vm.prank(hostileActor);
            escrow.rejectEscrow(decisionTargetId);
            _assertStatus(decisionTargetId, IEscrow.Status.Rejected);
            assertEq(second.balanceOf(carol), carolBefore + TARGET_AMOUNT);
        } else {
            vm.prank(hostileActor);
            escrow.recoverExpiredEscrow(recoverTargetId);
            _assertStatus(recoverTargetId, IEscrow.Status.Expired);
            assertEq(second.balanceOf(hostileActor), hostileBefore + TARGET_AMOUNT);
        }
    }
}
