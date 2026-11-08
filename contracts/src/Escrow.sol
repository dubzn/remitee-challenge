// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IEscrow} from "./IEscrow.sol";

/// @title Fixed-deadline ERC-20 escrow
/// @notice A multi-ID escrow with fixed parties, assets and resolution deadlines.
/// @dev Supports balance-preserving ERC-20s, including transfers with no return data.
/// Every payout requires an authorized transaction. No owner, pause, upgrade or rescue path exists.
/// SafeERC20/ReentrancyGuard errors and token reverts may also propagate to callers.
contract Escrow is IEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    /// @inheritdoc IEscrow
    uint256 public constant override CANCELLATION_WINDOW = 2 hours;
    /// @inheritdoc IEscrow
    uint256 public constant override ESCROW_TTL = 7 days;

    /// @dev Last successfully funded ID; zero means no escrows exist.
    uint256 private _lastEscrowId;
    /// @dev Per-ID records; terminal records remain readable. No per-account ID arrays are stored.
    mapping(uint256 => EscrowRecord) private _escrows;

    /// @inheritdoc IEscrow
    function createEscrow(address beneficiary, address token, uint256 amount)
        external
        nonReentrant
        returns (uint256 escrowId)
    {
        if (amount == 0) revert InvalidAmount();
        if (beneficiary == address(0) || beneficiary == msg.sender || beneficiary == address(this)) {
            revert InvalidBeneficiary(beneficiary);
        }
        if (token == address(0) || token == address(this) || token.code.length == 0) revert InvalidToken(token);

        uint64 createdAt = block.timestamp.toUint64();
        uint64 cancelDeadline = (block.timestamp + CANCELLATION_WINDOW).toUint64();
        uint64 expiresAt = (block.timestamp + ESCROW_TTL).toUint64();

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = asset.balanceOf(address(this));
        // A negative balance change cannot represent a funded deposit either.
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != amount) revert UnexpectedReceivedAmount(amount, received);

        escrowId = _lastEscrowId + 1;
        _escrows[escrowId] = EscrowRecord({
            sender: msg.sender,
            beneficiary: beneficiary,
            token: token,
            amount: amount,
            createdAt: createdAt,
            cancelDeadline: cancelDeadline,
            expiresAt: expiresAt,
            status: Status.Pending
        });
        _lastEscrowId = escrowId;
        emit EscrowCreated(escrowId, msg.sender, beneficiary, token, amount, cancelDeadline, expiresAt, createdAt);
    }

    /// @inheritdoc IEscrow
    function cancelEscrow(uint256 escrowId) external nonReentrant {
        EscrowRecord storage record = _pending(escrowId);
        _requireCaller(escrowId, record.sender);
        if (block.timestamp >= record.cancelDeadline) revert CancellationWindowClosed(escrowId, record.cancelDeadline);
        _pay(record, Status.CancelledBySender, record.sender);
        emit EscrowCancelled(escrowId, record.sender);
    }

    /// @inheritdoc IEscrow
    function confirmEscrow(uint256 escrowId) external nonReentrant {
        EscrowRecord storage record = _pending(escrowId);
        _requireCaller(escrowId, record.beneficiary);
        if (block.timestamp >= record.expiresAt) revert DecisionWindowClosed(escrowId, record.expiresAt);
        _pay(record, Status.Released, record.beneficiary);
        emit EscrowReleased(escrowId, record.beneficiary);
    }

    /// @inheritdoc IEscrow
    function rejectEscrow(uint256 escrowId) external nonReentrant {
        EscrowRecord storage record = _pending(escrowId);
        _requireCaller(escrowId, record.beneficiary);
        if (block.timestamp >= record.expiresAt) revert DecisionWindowClosed(escrowId, record.expiresAt);
        _pay(record, Status.Rejected, record.sender);
        emit EscrowRejected(escrowId, record.beneficiary);
    }

    /// @inheritdoc IEscrow
    function recoverExpiredEscrow(uint256 escrowId) external nonReentrant {
        EscrowRecord storage record = _pending(escrowId);
        _requireCaller(escrowId, record.sender);
        if (block.timestamp < record.expiresAt) revert EscrowNotExpired(escrowId, record.expiresAt);
        _pay(record, Status.Expired, record.sender);
        emit EscrowExpired(escrowId, record.sender);
    }

    /// @inheritdoc IEscrow
    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory) {
        return _existing(escrowId);
    }

    function _existing(uint256 escrowId) private view returns (EscrowRecord storage record) {
        if (escrowId == 0 || escrowId > _lastEscrowId) revert EscrowNotFound(escrowId);
        return _escrows[escrowId];
    }

    function _pending(uint256 escrowId) private view returns (EscrowRecord storage record) {
        record = _existing(escrowId);
        if (record.status != Status.Pending) revert EscrowNotPending(escrowId, record.status);
    }

    function _requireCaller(uint256 escrowId, address expected) private view {
        if (msg.sender != expected) revert UnauthorizedCaller(escrowId, msg.sender, expected);
    }

    function _pay(EscrowRecord storage record, Status status, address recipient) private {
        record.status = status;
        IERC20(record.token).safeTransfer(recipient, record.amount);
    }
}
