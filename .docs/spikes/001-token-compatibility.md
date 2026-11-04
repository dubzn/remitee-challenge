# Spike 001: token compatibility and accounting

Status: desk reviewed; proposed conclusion recorded in the SDD. No runtime verification. Original timebox: 25 minutes.

## Question and source

The challenge requires any ERC-20 per escrow and no-return transfer compatibility (page 2), but lists fee-on-transfer support as optional (page 3). Define a defensible baseline without claiming all token economics are safe.

## Working hypothesis

Use SafeERC20 for standard/no-return tokens, guard every mutating entry point against reentrancy, and reject a deposit if actual received balance delta differs from the requested amount. Do not add a token allowlist or owner.

Explicitly exclude fee-on-transfer and rebasing support. A deposit check cannot detect every future transfer fee, blacklist, pause, or dishonest token. Do not claim that SafeERC20 prevents those behaviors.

The beneficiary must also differ from the escrow contract itself: otherwise a release can strand funds by sending them to the escrow. Evaluate this as an additional documented validation assumption.

## Questions to close

- Does strict received-amount accounting meet the intended baseline while keeping fee support optional?
- What failures need dedicated custom errors versus clearly attributable library/token reverts?
- How should invalid token addresses and beneficiary equal to the contract be handled?
- What conservation property remains correct when someone transfers tokens directly to the escrow contract?

## Decision artifact and verification

Write the accepted asset policy in the SDD/README. Plan tests for standard/no-return/false-return tokens, allowance and balance failures, callback reentrancy, failed outgoing transfer, multiple escrows/tokens, and unsolicited donations. For supported tokens, liabilities must stay fully backed; raw balance equality requires excluding donations.

Exit: candidate can explain both the compatibility promise and why hostile or externally frozen tokens can still fail. No fee accounting extension is needed to close this spike.

## Desk review result

Keep the strict received-amount policy, SafeERC20, all-entry reentrancy guards, and beneficiary-self rejection as the architecture proposal. Reject zero/code-less token addresses explicitly. Dedicated escrow custom errors cover domain rules; clear library/token reverts may propagate. Do not build pull-payment accounting or fee support. Verify the listed cases during the contract slice rather than creating a prototype now.
