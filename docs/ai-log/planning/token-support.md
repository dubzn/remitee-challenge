# Token compatibility, freezes and recovery limits

Date: November 6, 2026. This documents the implemented contract and future asset-risk considerations. It adds no token restriction, administrator, rescue method, monitoring service or new implementation gate. The [SDD](sdd/escrow.md) remains the acceptance source.

## Supported behavior and admission

The challenge permits a token address per escrow and requires no-return transfer compatibility. The implementation has no allowlist and does not certify an asset merely because creation succeeds. Its accounting guarantee assumes honest, balance-preserving ERC-20 behavior throughout the escrow lifetime:

| Token behavior | Current treatment / guarantee |
| --- | --- |
| Standard ERC-20, exact transfers, stable balances | Supported under the caller/time rules and sufficient backing. No special symbol or decimals are required. |
| Transfers return no data and revert on failure | Supported by SafeERC20; the same exact-transfer assumptions apply. No-return compatibility alone does not certify a token. |
| Transfer returns false or reverts | The attempted operation reverts. Failed creation consumes no ID; failed payout keeps the escrow Pending. |
| Incoming fee, partial credit or unexpected balance delta | Creation rejects the deposit when the measured receipt differs from amount. No escrow is created. |
| Outgoing fee, rebasing, confiscation, dishonest balanceOf or false success | Outside the accounting guarantee. Deposit checks cannot certify future behavior. Payout has no recipient-balance-delta check; reported success is not proof of exact receipt for these tokens. |
| Issuer pause, blacklist, transfer restrictions or upgrade authority | External availability risk. Otherwise compatible transfers can become unavailable after funding. Recovery is conditional on the token permitting the required transfer. |

SafeERC20 handles call/return conventions; it cannot compel an issuer to transfer, reverse an external freeze or prove arbitrary token economics. ERC-20 has no universal pause/blacklist introspection interface. A missing paused/isBlacklisted method does not prove the absence of restrictions. [SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20), [ERC-20 interface](https://eips.ethereum.org/EIPS/eip-20).

No named mainnet asset is approved by this document. A real-asset assessment must pin chain, contract address, implementation/version and issuer controls; a ticker is insufficient. Circle's published transfer implementation is a concrete example of pause and sender/recipient blacklist checks, not evidence about every deployment or every ERC-20. [Issuer source](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v1/FiatTokenV1.sol).

## What happens after an external restriction

The following cases assume the token enforces the stated restriction and fails by reverting or returning false. Exact address checks vary by token.

| Incident | Consequence under the current escrow rules |
| --- | --- |
| Token paused before funding | A rejected transferFrom reverts creation. A separate earlier approval remains a separate transaction. |
| Token globally pauses after funding | Every payout of that token can fail, including expiry recovery. The escrow retains Pending; deadlines continue to advance. |
| Escrow address blacklisted | If transfers from the escrow are forbidden, every ID holding that asset at this shared address can be blocked. This is an asset-wide exposure across those IDs, not just one ID. |
| Beneficiary blacklisted | Release can fail. Refund to the fixed sender may still work through an allowed action and time window if the token permits that transfer. There is no alternate beneficiary address. |
| Sender blacklisted | Refund paths can fail. Beneficiary confirmation before expiry may still work if the token permits escrow-to-beneficiary transfers; this depends on its actual checks. At expiry, that confirmation path closes. |
| Restriction removed later | The permitted party can retry an action that is still valid then. After expiry only sender recovery remains; failed confirmation/rejection does not reserve the earlier window. Nothing retries automatically. |
| Restriction never removed, or backing confiscated/burned | Funds may remain inaccessible indefinitely, or backing may be lost. No unconditional recovery promise is possible. |

A temporary pause spanning day seven can therefore change which party can resolve the escrow when transfers resume. It does not extend the beneficiary's deadline. Expiry authorizes a sender action; it is neither an automatic refund nor permission to bypass the token contract.

In Escrow._pay, the terminal state is written before safeTransfer. A detected transfer failure reverts that whole transaction, restoring Pending and removing its resolution event. This protects accounting/state from a failed payout, not eventual transfer availability. Tokens that falsely report success are outside that guarantee. [Implementation](../contracts/src/Escrow.sol).

## What prevention can and cannot achieve

The challenge keeps its existing input checks, exact incoming receipt check, SafeERC20 and reentrancy protection. These reduce contract-level failures while retaining per-escrow token selection. A successful funding transaction cannot guarantee future transfer availability.

For a future production assessment, evaluate the following before selecting mechanisms:

1. Define an asset-admission policy from reviewed transfer economics, upgrade/admin powers and acceptable issuer risk. An allowlist could enforce admission in a different product, but is not implemented here and cannot eliminate future issuer action.
2. Where a reviewed token exposes reliable controls, observe current pause/blacklist status for escrow and relevant parties, and optionally simulate the intended transfer. These are point-in-time signals, not reservations or guarantees against a later restriction.
3. Consider issuer/proxy-change monitoring, incident records, and stopping new exposure. Distinguish token-specific transfer health from chain/indexer readiness; an external freeze does not by itself mean the RPC or event projection is broken.
4. Define an incident policy with the issuer and affected parties. Re-enable the token or remove its restriction only through the authority that actually controls it. A new escrow deployment cannot pull assets out of a frozen old address.

An escrow pause, upgrade or rescue function cannot override the token's own transfer checks. Giving an administrator new payout powers also conflicts with the challenge's party-only fund movement. Redirecting recipients changes the agreed rights and is not a generic freeze remedy. Separating every ID into another contract would change the required single-contract architecture and still would not remove issuer risk.

These are documented future options, not an implemented prevention guarantee or added work for this delivery.

## API and verification implications

The read API's canCancel/canRecover fields express recorded-state, role and time eligibility. They do not assert that a token transfer will succeed. ExpiredRecoverable may coexist with an externally frozen asset. A reverted payout emits no surviving escrow resolution event; the current event projection cannot infer the freeze reason or record every failed wallet attempt. No Frozen status, token-status poller or new API field is introduced here. See the [read API guide](read-api-design.md).

Existing tests in [EscrowAdversarial.t.sol](../contracts/test/EscrowAdversarial.t.sol) exercise no-return compatibility, incoming receipt mismatches, and both false-return/reverting payouts across all four outcomes, including retry when the token behaves again. This is evidence for generic detected-failure rollback, not issuer-specific blacklist/pause coverage. No new tests were run for this documentation-only follow-up.

If a later asset integration is authorized, verify separately: restriction before/after funding; escrow/sender/beneficiary blacklists; failure at and across exact deadlines; recovery after unpause/unblacklist; all IDs of the affected asset; and unaffected supported-token escrows. Assert balances, Pending status and absence of a successful resolution event on detected failure. If issuer status is exposed to clients, verify stale/unknown observations and avoid unconditional payout claims.
