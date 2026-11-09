# Escrow contract reference

The public contract is `IEscrow`; `Escrow` implements that interface with OpenZeppelin SafeERC20 and ReentrancyGuard. IDs are sequential within one deployment. User lists come from the indexed read API; the contract exposes one record by ID.

## Lifecycle and boundaries

Creation and funding happen in the same transaction after the sender approves the token allowance. Every resolution starts from Pending and pays the entire recorded amount:

| Action | Authorized caller | Chain-time condition | Recipient | Recorded result |
| --- | --- | --- | --- | --- |
| cancelEscrow | Sender | timestamp < cancelDeadline | Sender | CancelledBySender |
| confirmEscrow | Beneficiary | timestamp < expiresAt | Beneficiary | Released |
| rejectEscrow | Beneficiary | timestamp < expiresAt | Sender | Rejected |
| recoverExpiredEscrow | Sender | timestamp >= expiresAt | Sender | Expired |

Cancellation lasts 2 hours and expiry is 7 days from creation. Beneficiary decisions are allowed immediately, including during the cancellation window: the first successful resolution wins. Expiry alone does not change storage or transfer funds. The API's ExpiredRecoverable is a derived observation of a still-Pending record.

A reverting or false-returning transfer reverts the whole resolution, including its status and event. Outgoing balances are not rechecked: a token that reports success without paying is outside the supported model. Supported assets must preserve balances and transfer the exact amount. No-return transfers are supported; fee-on-transfer, rebasing and dishonest tokens are outside the supported model. There is no whitelist or semantic proof of an arbitrary token. Issuer pause/blacklist restrictions can prevent recovery as well as other payouts. There is no owner, emergency pause, upgrade or rescue mechanism.

Resolution checks run in this order: existing ID, Pending status, authorized caller, then time condition. Business errors are documented on IEscrow. The compiled implementation also includes OpenZeppelin's SafeERC20FailedOperation, ReentrancyGuardReentrantCall and SafeCastOverflowedUintDowncast errors; token reverts and Solidity panics may propagate too.

## Generate and read the reference

From the repository root, with the pinned Node/npm versions, initialized submodules and Docker running:

```sh
npm run contracts:docs
python3 -m http.server 8000 --bind 127.0.0.1 --directory .local/contracts-docs/book
```

Open http://127.0.0.1:8000 and use the IEscrow/Escrow sidebar entries. Serve the book at the HTTP root: generated inheritance links are root-relative and will not navigate correctly via file://, under a nested URL prefix or as raw Markdown links. The generated Markdown is under `.local/contracts-docs/src`; HTML is under `.local/contracts-docs/book`. Both are ignored and regenerated, never committed. The command uses the same digest-pinned Foundry 1.4.1 image as contract checks; no separate mdbook installation is needed. MathJax is disabled, and the generated site's runtime assets stay local. Reference hyperlinks are not offline runtime dependencies.

The generator checks compiler NatSpec inheritance for every public method, events and custom errors, rendered method descriptions, and local page/resource targets. Solidity 0.8.30 inherits the two constant getters' notices but omits their interface `@return` devdoc from implementation output: return descriptions remain on IEscrow, and the implementation shows the constant declarations. The optional print view is disabled because the pinned generator corrupts an inheritance link there; the main HTML pages retain working links. The contract CI job runs the same command after its behavior checks. Native Foundry 1.4.1 users can also run `cd contracts && forge doc --build`; that generates the book without the repository's verification wrapper.

NatSpec changes Solidity metadata and can change deployed bytecode hashes without changing the ABI or executable behavior. An existing deployment and its matching descriptor remain valid together. Selecting a new build requires a new validated deployment/descriptor and matching index schema/replay; do not rewrite a descriptor or silently reset a database.

I keep decisions, token limits and verification commands in the [project README](https://github.com/dubzn/remitee-challenge#readme).
