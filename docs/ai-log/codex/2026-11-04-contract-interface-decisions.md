# Contract objective, interface and storage review disposition

Date: 2026-11-04. Scope: documentation for candidate approval, not contract implementation. The candidate explicitly deferred pause/upgrade decisions. No Solidity, dependencies, tests or runtime configuration were added or changed.

## Review and adopted changes

Claude Opus/xhigh returned **NEEDS_REVISION (small document changes only)**, while calling the interface/storage sound and proportional. Preserve the [exact prompt](../claude/2026-11-04-contract-interface-prompt.md) and [unmodified response](../claude/2026-11-04-contract-interface-review.md). References there describe the revision read, not the final wording. Codex applied these corrections; no second Claude verdict or candidate approval is implied.

- C2/C3 now require focused exact-selector/argument tests for each domain error and spell out party-role swaps, unrelated callers and an unrelated deployer. Library errors are asserted only with the selected version and controlled fixtures.
- C10 checks that this core ABI exposes exactly five mutating actions. A later pause/upgrade choice must deliberately revise the authority checks; this is not a source ban on administration.
- C6 targets the five entries from deposit/payout callbacks and asserts the inner guard failure, avoiding a false pass from a role/ID error. A second ID/token is included without multiplying every axis. C7 uses representative fixed scenarios; invariant tooling remains optional. Revert log consequences are folded into existing checks.
- Renamed the struct to `EscrowRecord` to avoid confusion with a contract named Escrow; no assertion about a compiler collision is needed. Renamed the confirm/reject deadline error to `DecisionWindowClosed`.
- Replaced the misleading "attributable token errors" claim: external tokens control their revert bytes and can imitate another selector. The same qualification was added to the token spike.
- Stored deadlines are justified by consistency among checks, events and getter, not a guarantee against later code changes. Example balance tests are representative evidence, not a proof for every hostile token.
- The SDD labels non-upgradeability as the initial proposal, with the candidate's pause/upgrade discussion deferred. Part of that clarification was already applied while Claude was reading. No proxy or initializer is approved.

## Independent checks and choices

Re-read all four challenge PDF pages as text and compared pages 1-2 with the state/action/event rules; the original visual review remains unchanged. No function signature, type width, constructor or owner/pause/upgrade design is prescribed by those pages. The five actions, actor/time conditions, ID getter and required event names/creation fields are prescribed.

Keep uint256 IDs/amounts and uint64 timestamps with checked narrowing. Solidity's [layout rules](https://docs.soliditylang.org/en/v0.8.30/internals/layout_in_storage.html) support the expected five-slot struct: three address slots, one amount slot, then 25 bytes for three timestamps/enum. Exact absolute slots are not frozen and there was no compilation or gas measurement. Claude's gas estimate was not adopted: in the draft's unchanged field order, replacing all timestamps with uint256 would occupy eight value slots; seven requires reordering status to pack with an address. No optimization goal or numeric gas saving is added.

The private counter/mapping and standard inherited guard bookkeeping remain sufficient. IDs are contiguous only after successful funding; a missing mapping entry's default Pending enum must not create a readable escrow. No extra existence flag, party array, withdraw mapping or on-chain aggregate is added. Constants/read getters are retained as harmless inspection conveniences, not API requirements.

Checked [Solidity's error-data warning](https://docs.soliditylang.org/en/v0.8.30/abi-spec.html#errors) and official [SafeERC20 v5.4.0 source](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.4.0/contracts/token/ERC20/utils/SafeERC20.sol) for revert propagation, plus [public getter overriding](https://docs.soliditylang.org/en/v0.8.30/contracts.html#function-overriding). This source check does not pin/install that OpenZeppelin version or compile the illustrated interface. Library compatibility, exact error ABI and inherited layout remain implementation checks.

Cross-token wording stays narrow: fixed asset selection and guarding entry points prevent contract-level redirection/reentry paths; one hostile token cannot be assumed to supply honest backing for its own IDs. Tests against another supported token check that contract boundary. No unconditional isolation promise is made about arbitrary tokens with shared external control or broken economics.

## Result and next gate

The [revised proposal](../../contract-design.md) and canonical C1-C10 checks are ready to present to the candidate. They remain proposals and unchecked requirements. No contract test was run and no Solidity source was created. Candidate validation of the interface/storage is the next gate; pause/upgrade discussion remains separate as requested.
