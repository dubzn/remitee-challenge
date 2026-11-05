// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IEscrow} from "../../src/IEscrow.sol";

/// @dev Test-only ERC-20-compatible token whose approve/transfer/transferFrom return no data.
/// Failures revert with token-specific errors. Unrestricted minting is for local tests only.
contract AdvNoReturnToken {
    error AdvNoReturnToken_InsufficientBalance(address account, uint256 balance, uint256 needed);
    error AdvNoReturnToken_InsufficientAllowance(address owner, address spender, uint256 allowance, uint256 needed);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external {
        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function approve(address spender, uint256 value) external {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
    }

    function transfer(address to, uint256 value) external {
        _move(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) external {
        uint256 current = allowance[from][msg.sender];
        if (current < value) revert AdvNoReturnToken_InsufficientAllowance(from, msg.sender, current, value);
        if (current != type(uint256).max) allowance[from][msg.sender] = current - value;
        _move(from, to, value);
    }

    function _move(address from, address to, uint256 value) private {
        uint256 balance = balanceOf[from];
        if (balance < value) revert AdvNoReturnToken_InsufficientBalance(from, balance, value);
        unchecked {
            balanceOf[from] = balance - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}

/// @dev Test-only OpenZeppelin ERC-20 with a configurable misbehavior for `transfer` (escrow payout)
/// and `transferFrom` (escrow deposit). Unrestricted minting/configuration is for local tests only.
contract AdvModalToken is ERC20 {
    enum Mode {
        Normal,
        // Moves the balance (and spends allowance for transferFrom), then still returns false.
        ReturnFalse,
        // Reverts with AdvModalToken_ForcedRevert before any state change.
        Revert,
        // Credits `value - modeParam` to the recipient and burns `modeParam` from the source (fee-like).
        ShortReceipt,
        // Returns true without moving anything (allowance is still spent for transferFrom).
        NoCredit,
        // Credits `value` and mints an extra `modeParam` to the recipient.
        ExcessReceipt,
        // Moves nothing and burns `modeParam` from the recipient, so its balance decreases.
        DebitRecipient
    }

    error AdvModalToken_ForcedRevert(address from, address to, uint256 value);

    Mode public transferMode;
    Mode public transferFromMode;
    uint256 public modeParam;

    constructor() ERC20("Adversarial Modal Token", "ADVM") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function setModes(Mode transferMode_, Mode transferFromMode_, uint256 modeParam_) external {
        transferMode = transferMode_;
        transferFromMode = transferFromMode_;
        modeParam = modeParam_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        return _apply(transferMode, _msgSender(), to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        Mode mode = transferFromMode;
        if (mode == Mode.Revert) revert AdvModalToken_ForcedRevert(from, to, value);
        _spendAllowance(from, _msgSender(), value);
        return _apply(mode, from, to, value);
    }

    function _apply(Mode mode, address from, address to, uint256 value) private returns (bool) {
        if (mode == Mode.Revert) revert AdvModalToken_ForcedRevert(from, to, value);
        if (mode == Mode.NoCredit) return true;
        if (mode == Mode.ShortReceipt) {
            _transfer(from, to, value - modeParam);
            _burn(from, modeParam);
            return true;
        }
        if (mode == Mode.ExcessReceipt) {
            _transfer(from, to, value);
            _mint(to, modeParam);
            return true;
        }
        if (mode == Mode.DebitRecipient) {
            _burn(to, modeParam);
            return true;
        }
        _transfer(from, to, value);
        return mode == Mode.Normal;
    }
}

/// @dev Test-only OpenZeppelin ERC-20 that runs a one-shot hook whenever a balance update touches the
/// watched escrow (deposit into it or payout from it). The hook runs AFTER the balance update, so during
/// a deposit the escrow already holds the funds and during a payout the recipient already holds them.
/// The hook can (1) staticcall `getEscrow(probeId)` and record or revert with the result, and
/// (2) call the escrow with arbitrary calldata, recording the low-level result and either swallowing
/// a failure (outer transfer proceeds) or bubbling it wrapped in AdvReentrantToken_CallbackFailed.
/// Unrestricted minting/configuration is for local tests only.
contract AdvReentrantToken is ERC20 {
    error AdvReentrantToken_CallbackFailed(bytes innerRevert);
    error AdvReentrantToken_ProbeResult(bool success, bytes returnData);

    address public immutable ESCROW;

    // Hook configuration.
    bool public armed;
    bool public bubble;
    bool public probe;
    bool public revertWithProbe;
    uint256 public probeId;
    bytes public reentryData;

    // Observations, reset on every arm.
    uint256 public hookRuns;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public reentryReturnData;
    bool public probeSucceeded;
    bytes public probeReturnData;

    constructor(address escrow_) ERC20("Adversarial Reentrant Token", "ADVR") {
        ESCROW = escrow_;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    /// @notice Arms the hook with an optional reentrant ESCROW call and no getter probe.
    function arm(bytes calldata data, bool bubbleFailure) external {
        _arm(data, bubbleFailure, false, 0, false);
    }

    /// @notice Arms the hook with a getter probe that runs before the optional reentrant call.
    function armWithProbe(bytes calldata data, bool bubbleFailure, uint256 id, bool revertWithResult) external {
        _arm(data, bubbleFailure, true, id, revertWithResult);
    }

    function disarm() external {
        armed = false;
    }

    function _arm(bytes calldata data, bool bubbleFailure, bool probeEnabled, uint256 id, bool revertWithResult)
        private
    {
        armed = true;
        bubble = bubbleFailure;
        probe = probeEnabled;
        probeId = id;
        revertWithProbe = revertWithResult;
        reentryData = data;

        hookRuns = 0;
        reentryAttempted = false;
        reentrySucceeded = false;
        delete reentryReturnData;
        probeSucceeded = false;
        delete probeReturnData;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && (from == ESCROW || to == ESCROW)) {
            // One-shot: disarm before any external call so nested transfers cannot loop.
            armed = false;
            _runHook();
        }
    }

    function _runHook() private {
        hookRuns += 1;

        if (probe) {
            (bool ok, bytes memory ret) = ESCROW.staticcall(abi.encodeCall(IEscrow.getEscrow, (probeId)));
            probeSucceeded = ok;
            probeReturnData = ret;
            if (revertWithProbe) revert AdvReentrantToken_ProbeResult(ok, ret);
        }

        bytes memory data = reentryData;
        if (data.length != 0) {
            (bool ok, bytes memory ret) = ESCROW.call(data);
            reentryAttempted = true;
            reentrySucceeded = ok;
            reentryReturnData = ret;
            if (!ok && bubble) revert AdvReentrantToken_CallbackFailed(ret);
        }
    }
}
