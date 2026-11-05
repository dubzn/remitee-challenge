# Bounded adversarial escrow tests and independent core review

Date: 2026-11-05. Candidate authorized implementation after approving/committing the core design. Requested model opus, effort xhigh, edit mode via subscription runner. No shell or other agent. Do not write a plan file.

## Ownership

Create/edit only `contracts/test/EscrowAdversarial.t.sol` and `contracts/test/mocks/AdversarialTokens.sol`. Do not edit production source, common MockERC20, Foundry/root config, lockfiles, CI or docs. Codex simultaneously owns core lifecycle/time/access/event/isolation tests in `contracts/test/Escrow.t.sol`. You own these bounded test files and a review response; Codex runs and integrates all tests.

Read `contracts/src/Escrow.sol`, `contracts/src/IEscrow.sol`, `contracts/test/mocks/MockERC20.sol`, `contracts/foundry.toml`, `contracts/remappings.txt`, `.docs/contract-design.md` and SDD C1-C10. Core ABI is approved. No pause/owner/proxy/upgrade additions; no API, deploy or indexer. The production contract is deliberately simple, using SafeERC20, a persistent ReentrancyGuard and checked uint64 timestamps.

## Dependencies and testing contract

Solidity 0.8.30/Cancun; native/pinned Docker Foundry 1.4.1. OpenZeppelin 5.7.0 and forge-std 1.16.2 are being pinned as git submodules; verify local headers/signatures rather than assuming an old API. Import Test/Vm from forge-std and Escrow/IEscrow from ../src, mocks from ./mocks. Test contracts must be named `EscrowAdversarialTest` or a similarly unambiguous suffix. No FFI, filesystem permissions, forks, external RPC or new dependency. Do not alter common fixtures. Namespace your token mocks to avoid clashes.

## Essential cases in your slice

1. Standard-compatible token variants: no-return transfer/transferFrom must fund and resolve all four outcomes. False/reverting transfers on deposit/payout must roll back record, ID consumption, balances and allowances as relevant. Use exact selected library errors for controlled fixtures.
2. Received-delta mismatch (fee/short receipt; optionally zero or negative credit) rejects creation atomically and leaves first successful ID at 1. Do not add production fee support. Repeated creation after a failure must remain possible.
3. A malicious token callback attempts each of the five mutating functions from both deposit and payout (a bounded table of 10 cases is enough). Capture the low-level inner revert and assert the actual guard error, not merely an outer unrelated failure. Include a second ID and a supported second-token target. Swallowed callback failures may let the legitimate outer transfer succeed exactly once; a bubbled callback failure must roll back the outer operation. Confirm the guard recovers after a reverted operation.
4. During deposit callbacks, the future ID getter must fail rather than expose an unfunded Pending record. During payout, terminal state is visible before the external transfer; reverted payout restores Pending. Simple fixed scenarios suffice, no invariant framework or exhaustive Cartesian multiplication.

## Response

Report changed files, intended test cases, concrete security/logic findings and uncertainties. Independently review the core against the approved actor/time/fund/event rules, but suggest corrections in the response rather than editing production. Distinguish real blockers from optional refinements. These are candidate tests, not proof until Codex executes them. Keep English comments/output. Do not create any other file.
