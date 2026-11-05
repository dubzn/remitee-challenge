// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IEscrow {
    enum Status {
        Pending,
        CancelledBySender,
        Released,
        Rejected,
        Expired
    }

    struct EscrowRecord {
        address sender;
        address beneficiary;
        address token;
        uint256 amount;
        uint64 createdAt;
        uint64 cancelDeadline;
        uint64 expiresAt;
        Status status;
    }

    function createEscrow(address beneficiary, address token, uint256 amount) external returns (uint256 escrowId);
    function cancelEscrow(uint256 escrowId) external;
    function confirmEscrow(uint256 escrowId) external;
    function rejectEscrow(uint256 escrowId) external;
    function recoverExpiredEscrow(uint256 escrowId) external;
    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory);

    function CANCELLATION_WINDOW() external view returns (uint256);
    function ESCROW_TTL() external view returns (uint256);

    event EscrowCreated(
        uint256 indexed id,
        address indexed sender,
        address indexed beneficiary,
        address token,
        uint256 amount,
        uint64 cancelDeadline,
        uint64 expiresAt,
        uint64 createdAt
    );
    event EscrowCancelled(uint256 indexed id, address indexed sender);
    event EscrowReleased(uint256 indexed id, address indexed beneficiary);
    event EscrowRejected(uint256 indexed id, address indexed beneficiary);
    event EscrowExpired(uint256 indexed id, address indexed sender);

    error InvalidAmount();
    error InvalidBeneficiary(address beneficiary);
    error InvalidToken(address token);
    error EscrowNotFound(uint256 escrowId);
    error EscrowNotPending(uint256 escrowId, Status currentStatus);
    error UnauthorizedCaller(uint256 escrowId, address caller, address expected);
    error CancellationWindowClosed(uint256 escrowId, uint64 cancelDeadline);
    error DecisionWindowClosed(uint256 escrowId, uint64 expiresAt);
    error EscrowNotExpired(uint256 escrowId, uint64 expiresAt);
    error UnexpectedReceivedAmount(uint256 expected, uint256 received);
}
