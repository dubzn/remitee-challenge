// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Escrow} from "../src/Escrow.sol";
import {IEscrow} from "../src/IEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract EscrowTest is Test {
    Escrow internal escrow;
    MockERC20 internal token;
    address internal constant SENDER = address(0xA11CE);
    address internal constant BENEFICIARY = address(0xB0B);
    address internal constant THIRD = address(0xCAFE);
    uint256 internal constant AMOUNT = 100 ether;
    uint256 internal constant SUPPLY = 1_000 ether;
    uint256 internal constant START = 1_700_000_000;

    function setUp() public {
        vm.warp(START);
        escrow = new Escrow();
        token = new MockERC20();
        token.mint(SENDER, SUPPLY);
        vm.prank(SENDER);
        token.approve(address(escrow), type(uint256).max);
    }

    function _create() internal returns (uint256) {
        vm.prank(SENDER);
        return escrow.createEscrow(BENEFICIARY, address(token), AMOUNT);
    }

    function _act(uint8 action, uint256 id, address caller) internal {
        vm.prank(caller);
        if (action == 0) escrow.cancelEscrow(id);
        else if (action == 1) escrow.confirmEscrow(id);
        else if (action == 2) escrow.rejectEscrow(id);
        else escrow.recoverExpiredEscrow(id);
    }

    function _caller(uint8 action) internal pure returns (address) {
        return action == 0 || action == 3 ? SENDER : BENEFICIARY;
    }

    function _final(uint8 action) internal pure returns (IEscrow.Status) {
        if (action == 0) return IEscrow.Status.CancelledBySender;
        if (action == 1) return IEscrow.Status.Released;
        if (action == 2) return IEscrow.Status.Rejected;
        return IEscrow.Status.Expired;
    }

    function testCreationFundsExactAmountAndStoresTerms() public {
        uint256 id = _create();
        IEscrow.EscrowRecord memory record = escrow.getEscrow(id);
        assertEq(id, 1);
        assertEq(record.sender, SENDER);
        assertEq(record.beneficiary, BENEFICIARY);
        assertEq(record.token, address(token));
        assertEq(record.amount, AMOUNT);
        assertEq(uint256(record.createdAt), START);
        assertEq(uint256(record.cancelDeadline), START + 2 hours);
        assertEq(uint256(record.expiresAt), START + 7 days);
        assertEq(uint256(record.status), uint256(IEscrow.Status.Pending));
        assertEq(escrow.CANCELLATION_WINDOW(), 2 hours);
        assertEq(escrow.ESCROW_TTL(), 7 days);
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(token.balanceOf(SENDER), SUPPLY - AMOUNT);
        assertEq(_create(), 2);
    }

    function testZeroAmountRevertsWithoutConsumingId() public {
        vm.expectRevert(IEscrow.InvalidAmount.selector);
        vm.prank(SENDER);
        escrow.createEscrow(BENEFICIARY, address(token), 0);
        assertEq(token.balanceOf(SENDER), SUPPLY);
        assertEq(_create(), 1);
    }

    function testInvalidBeneficiariesRevertWithExactAddress() public {
        address[3] memory values = [address(0), SENDER, address(escrow)];
        for (uint256 i; i < values.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidBeneficiary.selector, values[i]));
            vm.prank(SENDER);
            escrow.createEscrow(values[i], address(token), AMOUNT);
        }
        assertEq(_create(), 1);
    }

    function testZeroSelfAndCodeLessTokensRevert() public {
        address[3] memory values = [address(0), address(escrow), THIRD];
        for (uint256 i; i < values.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidToken.selector, values[i]));
            vm.prank(SENDER);
            escrow.createEscrow(BENEFICIARY, values[i], AMOUNT);
        }
        assertEq(_create(), 1);
    }

    function testInsufficientAllowanceAndBalanceRollbackCreation() public {
        vm.prank(SENDER);
        token.approve(address(escrow), 0);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(escrow), 0, AMOUNT)
        );
        _create();
        vm.prank(SENDER);
        token.approve(address(escrow), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, SENDER, SUPPLY, SUPPLY + 1)
        );
        vm.prank(SENDER);
        escrow.createEscrow(BENEFICIARY, address(token), SUPPLY + 1);
        assertEq(token.balanceOf(SENDER), SUPPLY);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(_create(), 1);
    }

    function testGetterAndAllActionsRejectMissingIds() public {
        uint256[3] memory ids = [uint256(0), 1, 999];
        for (uint256 i; i < ids.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IEscrow.EscrowNotFound.selector, ids[i]));
            escrow.getEscrow(ids[i]);
            for (uint8 action; action < 4; ++action) {
                vm.expectRevert(abi.encodeWithSelector(IEscrow.EscrowNotFound.selector, ids[i]));
                _act(action, ids[i], _caller(action));
            }
        }
    }

    function testPartyRoleSwapsThirdPartyAndDeployerHaveNoExtraRights() public {
        uint256 id = _create();
        address[4] memory callers = [SENDER, BENEFICIARY, THIRD, address(this)];
        for (uint8 action; action < 4; ++action) {
            address expected = _caller(action);
            for (uint256 i; i < callers.length; ++i) {
                if (callers[i] == expected) continue;
                vm.expectRevert(abi.encodeWithSelector(IEscrow.UnauthorizedCaller.selector, id, callers[i], expected));
                _act(action, id, callers[i]);
            }
        }
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(uint256(escrow.getEscrow(id).status), uint256(IEscrow.Status.Pending));
    }

    function _boundary(uint8 action, int256 offset) internal {
        uint256 id = _create();
        IEscrow.EscrowRecord memory record = escrow.getEscrow(id);
        uint64 deadline = action == 0 ? record.cancelDeadline : record.expiresAt;
        uint256 target = uint256(deadline);
        if (offset < 0) --target;
        else if (offset > 0) ++target;
        vm.warp(target);
        bool succeeds = action == 3 ? offset >= 0 : offset < 0;
        if (!succeeds) {
            bytes4 selector = action == 0
                ? IEscrow.CancellationWindowClosed.selector
                : action == 3 ? IEscrow.EscrowNotExpired.selector : IEscrow.DecisionWindowClosed.selector;
            vm.expectRevert(abi.encodeWithSelector(selector, id, deadline));
        }
        _act(action, id, _caller(action));
        assertEq(uint256(escrow.getEscrow(id).status), uint256(succeeds ? _final(action) : IEscrow.Status.Pending));
        assertEq(token.balanceOf(address(escrow)), succeeds ? 0 : AMOUNT);
        assertEq(token.balanceOf(BENEFICIARY), succeeds && action == 1 ? AMOUNT : 0);
        assertEq(token.balanceOf(SENDER), succeeds && action != 1 ? SUPPLY : SUPPLY - AMOUNT);
    }

    function testCancelJustBeforeTwoHours() public {
        _boundary(0, -1);
    }

    function testCancelAtTwoHoursFails() public {
        _boundary(0, 0);
    }

    function testCancelJustAfterTwoHoursFails() public {
        _boundary(0, 1);
    }

    function testConfirmJustBeforeSevenDays() public {
        _boundary(1, -1);
    }

    function testConfirmAtSevenDaysFails() public {
        _boundary(1, 0);
    }

    function testConfirmJustAfterSevenDaysFails() public {
        _boundary(1, 1);
    }

    function testRejectJustBeforeSevenDays() public {
        _boundary(2, -1);
    }

    function testRejectAtSevenDaysFails() public {
        _boundary(2, 0);
    }

    function testRejectJustAfterSevenDaysFails() public {
        _boundary(2, 1);
    }

    function testRecoverJustBeforeSevenDaysFails() public {
        _boundary(3, -1);
    }

    function testRecoverAtSevenDays() public {
        _boundary(3, 0);
    }

    function testRecoverJustAfterSevenDays() public {
        _boundary(3, 1);
    }

    function testBeneficiaryCanAcceptAtMinuteOneAndWinAgainstCancellation() public {
        uint256 id = _create();
        vm.warp(START + 1 minutes);
        _act(1, id, BENEFICIARY);
        assertEq(token.balanceOf(BENEFICIARY), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.EscrowNotPending.selector, id, IEscrow.Status.Released));
        _act(0, id, SENDER);
    }

    function testSenderCancellationCanWinBeforeBeneficiaryDecision() public {
        uint256 id = _create();
        _act(0, id, SENDER);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.EscrowNotPending.selector, id, IEscrow.Status.CancelledBySender));
        _act(1, id, BENEFICIARY);
        assertEq(token.balanceOf(SENDER), SUPPLY);
    }

    function testElapsedTimeDoesNotResolveOrRefund() public {
        uint256 id = _create();
        vm.warp(START + 8 days);
        assertEq(uint256(escrow.getEscrow(id).status), uint256(IEscrow.Status.Pending));
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(token.balanceOf(SENDER), SUPPLY - AMOUNT);
        _act(3, id, SENDER);
        assertEq(token.balanceOf(SENDER), SUPPLY);
    }

    function testEveryTerminalStateRejectsEveryResolution() public {
        uint256[4] memory ids;
        for (uint8 action; action < 4; ++action) {
            ids[action] = _create();
        }
        for (uint8 outcome; outcome < 4; ++outcome) {
            if (outcome == 3) vm.warp(START + 7 days);
            _act(outcome, ids[outcome], _caller(outcome));
            for (uint8 action; action < 4; ++action) {
                vm.expectRevert(
                    abi.encodeWithSelector(IEscrow.EscrowNotPending.selector, ids[outcome], _final(outcome))
                );
                _act(action, ids[outcome], _caller(action));
            }
        }
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(_create(), 5);
    }

    function testLargeUint256AmountIsNotNarrowed() public {
        uint256 large = 1 << 200;
        token.mint(SENDER, large);
        vm.prank(SENDER);
        uint256 id = escrow.createEscrow(BENEFICIARY, address(token), large);
        assertEq(escrow.getEscrow(id).amount, large);
        _act(1, id, BENEFICIARY);
        assertEq(token.balanceOf(BENEFICIARY), large);
    }

    function testOutOfRangeDeadlineRevertsBeforeFunding() public {
        uint256 timestamp = uint256(type(uint64).max) - 7 days + 1;
        vm.warp(timestamp);
        vm.expectRevert(
            abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintDowncast.selector, uint8(64), timestamp + 7 days)
        );
        _create();
        assertEq(token.balanceOf(SENDER), SUPPLY);
        assertEq(token.balanceOf(address(escrow)), 0);
        vm.warp(START);
        assertEq(_create(), 1);
    }

    function testMultipleTokensEscrowsAndDonationsRemainIsolated() public {
        MockERC20 second = new MockERC20();
        second.mint(SENDER, SUPPLY);
        uint256 first = _create();
        vm.prank(SENDER);
        uint256 other = escrow.createEscrow(THIRD, address(token), AMOUNT);
        vm.startPrank(SENDER);
        second.approve(address(escrow), AMOUNT);
        uint256 otherToken = escrow.createEscrow(BENEFICIARY, address(second), AMOUNT);
        assertTrue(token.transfer(address(escrow), 7));
        vm.stopPrank();
        assertEq(token.balanceOf(address(escrow)), 2 * AMOUNT + 7);
        _act(1, first, BENEFICIARY);
        assertEq(token.balanceOf(address(escrow)), AMOUNT + 7);
        assertEq(second.balanceOf(address(escrow)), AMOUNT);
        _act(2, other, THIRD);
        _act(0, otherToken, SENDER);
        assertEq(token.balanceOf(address(escrow)), 7);
        assertEq(second.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(BENEFICIARY), AMOUNT);
        assertEq(second.balanceOf(BENEFICIARY), 0);
    }

    function testReconstructAllOutcomesFromOnlyEscrowLogs() public {
        vm.recordLogs();
        uint256[4] memory ids;
        for (uint8 action; action < 4; ++action) {
            ids[action] = _create();
        }
        for (uint8 action; action < 4; ++action) {
            if (action == 3) vm.warp(START + 7 days);
            _act(action, ids[action], _caller(action));
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();
        IEscrow.EscrowRecord[4] memory projection;
        bytes32 created = keccak256("EscrowCreated(uint256,address,address,address,uint256,uint64,uint64,uint64)");
        bytes32[4] memory terminal = [
            keccak256("EscrowCancelled(uint256,address)"),
            keccak256("EscrowReleased(uint256,address)"),
            keccak256("EscrowRejected(uint256,address)"),
            keccak256("EscrowExpired(uint256,address)")
        ];
        uint256 count;
        for (uint256 i; i < logs.length; ++i) {
            Vm.Log memory entry = logs[i];
            if (entry.emitter != address(escrow)) continue;
            ++count;
            uint256 id = uint256(entry.topics[1]);
            IEscrow.EscrowRecord memory record = projection[id - 1];
            if (entry.topics[0] == created) {
                assertEq(entry.topics.length, 4);
                (address asset, uint256 amount, uint64 cancel, uint64 expiry, uint64 at) =
                    abi.decode(entry.data, (address, uint256, uint64, uint64, uint64));
                record = IEscrow.EscrowRecord(
                    address(uint160(uint256(entry.topics[2]))),
                    address(uint160(uint256(entry.topics[3]))),
                    asset,
                    amount,
                    at,
                    cancel,
                    expiry,
                    IEscrow.Status.Pending
                );
            } else {
                assertEq(entry.topics.length, 3);
                assertEq(entry.data.length, 0);
                bool recognized;
                for (uint8 action; action < 4; ++action) {
                    if (entry.topics[0] != terminal[action]) continue;
                    assertEq(address(uint160(uint256(entry.topics[2]))), _caller(action));
                    record.status = _final(action);
                    recognized = true;
                }
                assertTrue(recognized);
            }
            projection[id - 1] = record;
        }
        assertEq(count, 8);
        for (uint256 i; i < ids.length; ++i) {
            assertEq(keccak256(abi.encode(projection[i])), keccak256(abi.encode(escrow.getEscrow(ids[i]))));
        }
    }
}
