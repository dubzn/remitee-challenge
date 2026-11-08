// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title Fixed-deadline ERC-20 escrow interface
/// @notice Holds individually identified deposits until an authorized party resolves them.
/// @dev Deadlines use block.timestamp in Unix seconds. Time alone never transfers tokens.
/// Supported assets must preserve balances and transfer the full amount on both legs.
/// Issuer pauses, blacklists or dishonest token logic can prevent any payout, including recovery.
interface IEscrow {
    /// @notice Recorded lifecycle outcome; elapsed time does not change Pending in storage.
    enum Status {
        /// @notice Funded and unresolved, including after expiry until sender recovery.
        Pending,
        /// @notice Sender cancelled before the cancellation deadline and received the deposit.
        CancelledBySender,
        /// @notice Beneficiary confirmed before expiry and received the deposit.
        Released,
        /// @notice Beneficiary rejected before expiry; the sender received the deposit.
        Rejected,
        /// @notice Sender recovered at or after expiry and received the deposit.
        Expired
    }

    /// @notice Immutable deposit terms plus its current recorded outcome.
    /// @dev Amounts are raw token units; timestamps are absolute Unix seconds.
    struct EscrowRecord {
        /// @notice Creator, funder and recipient of cancellation, rejection or expiry refunds.
        address sender;
        /// @notice Account allowed to confirm or reject; recipient of a confirmed deposit.
        address beneficiary;
        /// @notice ERC-20 asset held by the escrow contract.
        address token;
        /// @notice Full amount funded and owed, without decimal conversion.
        uint256 amount;
        /// @notice Creation block timestamp.
        uint64 createdAt;
        /// @notice Exclusive upper bound for sender cancellation.
        uint64 cancelDeadline;
        /// @notice Exclusive upper bound for beneficiary decisions; inclusive start of sender recovery.
        uint64 expiresAt;
        /// @notice Latest successful on-chain outcome, independent of elapsed time.
        Status status;
    }

    /// @notice Atomically fund a new escrow from the caller's tokens.
    /// @dev The caller must approve this contract for amount first. Beneficiary cannot be zero,
    /// the caller or this contract. Token must be a nonzero contract other than this contract.
    /// Receipt must equal amount exactly; a failed call rolls back transfer, ID and record.
    /// Deadlines are creation time plus CANCELLATION_WINDOW and ESCROW_TTL.
    /// No whitelist proves asset semantics; exact receipt does not prove future payouts are possible.
    /// Emits EscrowCreated only after successful funding. Repeated successful calls create new IDs.
    /// @param beneficiary Account allowed to accept or reject this deposit.
    /// @param token Address of the supported ERC-20 asset.
    /// @param amount Positive deposit in raw token units.
    /// @return escrowId New sequential positive ID, local to this contract deployment.
    function createEscrow(address beneficiary, address token, uint256 amount) external returns (uint256 escrowId);

    /// @notice Cancel a Pending escrow as its sender, refunding the full deposit to that sender.
    /// @dev Requires block.timestamp < cancelDeadline. Beneficiary decisions are allowed during
    /// this window: the first successful resolution wins. Emits EscrowCancelled after transfer.
    /// Failed payouts revert the state change; all resolution methods reject terminal escrows.
    /// @param escrowId Existing deposit to cancel.
    function cancelEscrow(uint256 escrowId) external;

    /// @notice Confirm a Pending escrow as its beneficiary, paying that beneficiary the full deposit.
    /// @dev Requires block.timestamp < expiresAt; there is no wait for the cancellation window.
    /// Emits EscrowReleased after transfer. A failed payout leaves the escrow Pending.
    /// @param escrowId Existing deposit to accept.
    function confirmEscrow(uint256 escrowId) external;

    /// @notice Reject a Pending escrow as its beneficiary, refunding the full deposit to its sender.
    /// @dev Requires block.timestamp < expiresAt. Emits EscrowRejected after transfer.
    /// The event identifies the beneficiary who rejected, rather than the refund recipient.
    /// A failed payout leaves the escrow Pending.
    /// @param escrowId Existing deposit to reject.
    function rejectEscrow(uint256 escrowId) external;

    /// @notice Recover a Pending escrow as its sender at or after expiry, refunding that sender.
    /// @dev Requires block.timestamp >= expiresAt. The sender must submit this transaction;
    /// expiry does not trigger an automatic transfer. Emits EscrowExpired after transfer.
    /// A failed payout leaves the escrow Pending; recovery cannot bypass token restrictions.
    /// @param escrowId Existing expired deposit to recover.
    function recoverExpiredEscrow(uint256 escrowId) external;

    /// @notice Read one existing escrow, including its recorded outcome and original deadlines.
    /// @dev Reverts with EscrowNotFound for zero or an unallocated ID. Pending can already be
    /// time-expired; no derived ExpiredRecoverable status is stored on chain. No owner enumeration.
    /// @param escrowId Existing deposit to inspect.
    /// @return The recorded deposit terms and status.
    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory);

    /// @notice Return the fixed sender cancellation window in seconds.
    /// @return Duration of 2 hours (7200 seconds), measured from creation.
    function CANCELLATION_WINDOW() external view returns (uint256);

    /// @notice Return the fixed escrow lifetime in seconds.
    /// @return Duration of 7 days (604800 seconds), measured from creation.
    function ESCROW_TTL() external view returns (uint256);

    /// @notice A new escrow was fully funded and recorded as Pending.
    /// @param id New escrow ID in this deployment.
    /// @param sender Creator and funder.
    /// @param beneficiary Account allowed to confirm or reject.
    /// @param token Deposited ERC-20 address.
    /// @param amount Exact deposit in raw token units.
    /// @param cancelDeadline Exclusive cancellation deadline in Unix seconds.
    /// @param expiresAt Beneficiary-decision deadline and sender-recovery start in Unix seconds.
    /// @param createdAt Creation block timestamp in Unix seconds.
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

    /// @notice Sender cancellation succeeded and the sender received the deposit.
    /// @param id Resolved escrow ID.
    /// @param sender Authorized caller and refund recipient.
    event EscrowCancelled(uint256 indexed id, address indexed sender);

    /// @notice Beneficiary confirmation succeeded and the beneficiary received the deposit.
    /// @param id Resolved escrow ID.
    /// @param beneficiary Authorized caller and payout recipient.
    event EscrowReleased(uint256 indexed id, address indexed beneficiary);

    /// @notice Beneficiary rejection succeeded and the sender received the deposit.
    /// @param id Resolved escrow ID.
    /// @param beneficiary Authorized caller who rejected; the sender receives the refund.
    event EscrowRejected(uint256 indexed id, address indexed beneficiary);

    /// @notice Explicit sender recovery succeeded at or after expiry.
    /// @param id Resolved escrow ID.
    /// @param sender Authorized caller and refund recipient.
    event EscrowExpired(uint256 indexed id, address indexed sender);

    /// @notice Creation requested a zero deposit.
    error InvalidAmount();

    /// @notice Creation supplied a zero, self or escrow-contract beneficiary.
    /// @param beneficiary Rejected beneficiary address.
    error InvalidBeneficiary(address beneficiary);

    /// @notice Creation supplied zero, this contract, or an address with no code as token.
    /// @param token Rejected token address.
    error InvalidToken(address token);

    /// @notice The requested ID is zero or has never been allocated.
    /// @param escrowId Requested nonexistent ID.
    error EscrowNotFound(uint256 escrowId);

    /// @notice The escrow already has a terminal recorded outcome.
    /// @param escrowId Deposit that cannot be resolved again.
    /// @param currentStatus Existing terminal outcome.
    error EscrowNotPending(uint256 escrowId, Status currentStatus);

    /// @notice The caller does not have the role required by this action.
    /// @param escrowId Target deposit.
    /// @param caller Actual msg.sender.
    /// @param expected Sender or beneficiary authorized for the requested action.
    error UnauthorizedCaller(uint256 escrowId, address caller, address expected);

    /// @notice Sender cancellation was attempted at or after its deadline.
    /// @param escrowId Target deposit.
    /// @param cancelDeadline Exclusive cancellation deadline in Unix seconds.
    error CancellationWindowClosed(uint256 escrowId, uint64 cancelDeadline);

    /// @notice Beneficiary confirmation or rejection was attempted at or after expiry.
    /// @param escrowId Target deposit.
    /// @param expiresAt Exclusive beneficiary-decision deadline in Unix seconds.
    error DecisionWindowClosed(uint256 escrowId, uint64 expiresAt);

    /// @notice Sender recovery was attempted before expiry.
    /// @param escrowId Target deposit.
    /// @param expiresAt Inclusive recovery start in Unix seconds.
    error EscrowNotExpired(uint256 escrowId, uint64 expiresAt);

    /// @notice The deposit did not increase this contract's token balance by the requested amount.
    /// @dev This check does not establish that an arbitrary token is safe or balance-preserving.
    /// @param expected Requested amount in raw token units.
    /// @param received Observed increase, or zero if the balance decreased.
    error UnexpectedReceivedAmount(uint256 expected, uint256 received);
}
