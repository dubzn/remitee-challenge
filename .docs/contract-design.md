# Escrow core interface and storage

Date: 2026-11-04. Candidate approved committing this core and starting implementation on 2026-11-05. This document records the approved interface/storage and refines SDD AC1-AC5. The November 5 core milestone is complete; emergency pause and upgradeability are future evaluations in [#8](https://github.com/dubzn/remitee-challenge/issues/8) and [#9](https://github.com/dubzn/remitee-challenge/issues/9). See [review disposition](outputs/codex/2026-11-04-contract-interface-decisions.md).

## Scope and approval boundary

One deployment manages many IDs. The challenge fixes actors, deadlines, outcomes, required event names and an ID getter. Function names, parameter order, errors, integer widths and storage below describe the approved implementation. This challenge uses the current direct, non-upgradeable contract without pause or privileged fund paths. Future alternatives require a separate authority/deployment review; their evaluation does not block this completed core.

## Approved public interface

The approved shape below is now implemented in [IEscrow](../contracts/src/IEscrow.sol) and [Escrow](../contracts/src/Escrow.sol); tests and compiled ABI checks match it. All actions are nonpayable. `msg.sender` is sender at creation; the beneficiary is the only other party specified by the caller.

```solidity
interface IEscrow {
    enum Status { Pending, CancelledBySender, Released, Rejected, Expired }

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

    function createEscrow(address beneficiary, address token, uint256 amount)
        external returns (uint256 escrowId);
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
```

Cancellation, acceptance, rejection and recovery take only the ID. The stored token, amount and parties fix the payout. Acceptance transfers to the beneficiary in that same transaction; there is no second withdraw. Rejection is called by the beneficiary but pays the sender. Advancing time never executes a payout.

`EscrowCreated` preserves the challenge's minimum fields and adds `createdAt` at the end. Only ID/sender/beneficiary are indexed: three indexed fields for this non-anonymous event. Resolution events name their authorized actor; rejection's actor is not its recipient. The indexer joins with creation by ID and uses log metadata for transaction/block identity. No transaction hashes are stored in the contract.

Domain errors do not exhaust possible reverts: the token, SafeERC20, the reentrancy guard and checked timestamp conversion can also revert. Token revert data can be propagated and is controlled by that external token; it may even imitate an escrow error. A matching selector alone does not authenticate its origin. Test domain errors before external calls with controlled fixtures; pin library errors when the dependency is selected. Error precedence for simultaneous invalid conditions is not yet a public guarantee.

## Implemented state variables

```solidity
uint256 public constant CANCELLATION_WINDOW = 2 hours;
uint256 public constant ESCROW_TTL = 7 days;

uint256 private _lastEscrowId; // Initially zero; first successful ID is 1.
mapping(uint256 => IEscrow.EscrowRecord) private _escrows;
```

The constants consume no persistent slots. Counter/mapping are the core's only ordinary top-level mutable variables. Pinned OpenZeppelin 5.7.0 ReentrancyGuard contributes its separate namespaced lock. Actual compiled layout and verification are recorded in the [implementation evidence](outputs/codex/2026-11-05-contract-implementation.md); no proxy layout is frozen.

Per-sender listing belongs to `GET /escrows?sender=...` over the indexed database, with filtering before pagination. The contract exposes lookup by ID, not a storage-enumeration API. A direct off-chain RPC consumer can also filter EscrowCreated logs by indexed sender, without iterating every ID. No per-sender array or mapping is added for this use case.

| Stored value | Purpose / rule |
| --- | --- |
| `_lastEscrowId` | Monotonic uint256 ID allocation. Only successful creation consumes an ID; terminal records are retained. |
| `_escrows[id].sender` | Deposit source and refund recipient; never supplied again on resolution. |
| `beneficiary` | Only acceptance/rejection caller; acceptance recipient. |
| `token`, `amount` | Fixed asset and exact liability for this ID; uint256 amount without narrowing. |
| `createdAt`, `cancelDeadline`, `expiresAt` | Unix seconds recorded at creation. Contract checks, emitted events and getter use the same recorded deadlines. This does not promise protection against a hypothetical privileged upgrade. |
| `status` | The challenge's five states; Pending is the zero enum value, not proof an ID exists. |

With contiguous successful IDs and no deletion, `id == 0 || id > _lastEscrowId` means missing. Getter and actions must check existence before treating the default mapping value as Pending. An ID is the mapping key, not another struct field. Events handle enumeration/filtering; no on-chain array, party index, withdrawable-balance mapping or redundant total-liability mapping is needed.

Calculate deadlines in uint256 and use checked conversion, such as SafeCast.toUint64, for every narrowing before external funding. A bare uint64 cast can truncate. Three uint64 timestamps and the enum naturally share one slot with this field order; the compiled struct uses five value slots. The implemented timestamps remain uint64. This is observed layout evidence, not a measured gas claim or a frozen proxy layout; inspection is informational for this core. uint256 timestamps are a valid alternative, not another requirement.

## Core execution rules

1. Creation is guarded throughout: validate inputs/timestamps, read the prior token balance, transfer, read the new balance and check the exact received delta, then record a funded Pending escrow, advance the ID and emit creation. No provisional record is exposed during token callbacks. A failure reverts all effects, except any separate prior approval transaction.
2. Each resolution is guarded, checks existence/Pending/caller/time, sets the terminal state, transfers to the fixed recipient and emits its one resolution event. Transfer failure restores Pending and all transaction-local effects.
3. Supported tokens are balance-preserving standard/no-return ERC-20s. False-return transfers fail. Fee/rebasing/blacklist/malicious-economics guarantees, permit and a whitelist are outside this core. Zero/self/code-less token rejection and beneficiary equal to this contract are implemented extra validations.
4. Multiple IDs share token balances. Representative tests check that, under supported semantics, balances cover Pending liabilities; these examples are not a universal proof. Fixing the token per ID and guarding every mutating entry point prevents an escrow action from redirecting another ID to a different asset. A hostile token can still lie about or strand the backing of its own escrows; a callback test against a second supported token checks contract-level cross-token isolation. Donations may make balances larger; they are not credited to an escrow or claimable through a new rescue method.

## SDD completion checks

The canonical [checklist](sdd/escrow.md#contract-slice-completion-checklist) maps AC1-AC5 to [actual evidence](outputs/codex/2026-11-05-contract-implementation.md). Local verification and both jobs of [CI run 41962697117](https://github.com/dubzn/remitee-challenge/actions/runs/41962697117) passed; C1-C10 are complete.

Codex implemented the core/tests and executed verification. Claude supplied bounded adversarial cases and an independent review. Both actual CI jobs passed. See the [milestone closeout](outputs/codex/2026-11-06-contract-closeout.md); no contract implementation remains in this slice.

## Primary references and limits

- Challenge PDF pages 1-2: required business rules/fields; [source summary](references.md).
- [Solidity 0.8.30 storage layout](https://docs.soliditylang.org/en/v0.8.30/internals/layout_in_storage.html): packing and inherited layout. Absolute slot numbers are not frozen here.
- [OpenZeppelin SafeCast and ReentrancyGuard](https://docs.openzeppelin.com/contracts/5.x/api/utils): checked narrowing and callback protection.
- [OpenZeppelin SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20): no-return/false-return handling, not arbitrary token economics.
- [Upgradeable contract constraints](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable): initialization and layout must be reviewed if that later option is chosen. Core approval does not make an ordinary contract safely upgradeable.
