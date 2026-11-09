# Confirmations, indexing capacity, and emergency pause

Date: 2026-11-04. Planning discussion, not implemented behavior. Supplements the [SDD](sdd/escrow.md) and [worked examples](design-review.md).

Current disposition, Nov 6: the contract milestone is closed with the implemented direct, non-upgradeable core and no pause. [#8](https://github.com/dubzn/remitee-challenge/issues/8) and [#9](https://github.com/dubzn/remitee-challenge/issues/9) track future evaluations outside this deliverable. The trade-offs below remain design context, not outstanding requirements for the completed core.

## Confirmed scope

- AC6 covers observation and traceability, not wallet execution, transaction submission, or automatic resubmission.
- PostgreSQL remains selected. Token support stays simple: standard balance-preserving ERC-20s plus the required no-return compatibility. Fee-on-transfer, rebasing, and token allowlists stay outside the baseline; token address remains selectable per escrow.
- A pause/gateway was requested for discussion, not authorized as a new contract authority or implementation task.

## Block cadence and one worker

[Ethereum L1 uses 12-second slots](https://ethereum.org/developers/docs/blocks/#block-time); missed slots can make the interval between produced blocks longer. This is not a measured current average or a throughput benchmark. Anvil's demo can mine blocks explicitly instead of reproducing mainnet timing.

Start with one ordered projection writer for this contract address. It fetches filtered logs over ranges, not all transactions from every block. A Node process can serve asynchronous API reads while its worker awaits RPC/database I/O.

Whether it keeps up depends on matching event volume, RPC latency/range limits, database latency, and historical backlog. Record batch duration, retry/error counts, RPC versus DB time, and eligible-block backlog. Distinguish expected confirmation lag from backlog: `head - indexedThrough` includes the deliberate delay; `max(0, eligibleHead - indexedThrough)` measures work still waiting to be applied.

Only if evidence shows a bottleneck, add bounded concurrent RPC fetching with a bounded reorder buffer. One coordinator still validates/applies contiguous ranges in chain order and advances the atomic checkpoint. A later fetched range cannot jump over an unfinished earlier range. Parallel writers or partitioned cursors are unnecessary for this exercise; a thread per block is not the default.

## Intermediate observation is compatible with confirmation waiting

Yes: inclusion is an observation, while admission into the authoritative API projection follows the chosen delay. The contract already executed on the current chain when the transaction was included; delaying the API does not delay or freeze its token transfer.

Proposed local demonstration: `confirmationDelay = 2` means **two additional blocks after inclusion**. This is descendant depth, not necessarily a wallet/library's confirmation-count convention. `0` remains an explicit fast-test mode, never a finality claim.

| Observed head | Eligible end | Event in block 111 |
| --- | --- | --- |
| 111 | 109 | Mined on the current chain, excluded from confirmed projection |
| 112 | 110 | Still waiting |
| 113 | 111 | Re-query/validate canonical logs and apply if still present |

If block 111 changes before admission, the worker must not promote its old log. A reorg deeper than the delay can still invalidate an already applied range, which is why checkpoint hashes and explicit recovery remain necessary. [Consensus finality](https://ethereum.org/developers/docs/consensus-mechanisms/pos/#finality) is stronger and distinct from a small number of following blocks; the local delay is educational, not an Ethereum production recommendation.

Keep the baseline journal scoped to admitted canonical events. Existing head/checkpoint/delay/backlog metadata explains the intermediate stage without persisting every provisional transaction. A durable provisional view would add observed/eligible/orphaned lifecycle and block-hash handling; it could share a table and need not introduce a broker. Record it as optional future observability. Eligibility is not yet a committed projection: a slow worker can still be behind eligibleHead. Escrow Pending and a transaction waiting for confirmations are different states.

## One deployment already manages all escrow IDs

The challenge asks for one contract managing many escrows. It does not deploy one contract per operation. A pause flag in that contract would already affect every ID covered by its guarded functions. An additional gateway is not required merely to obtain one global switch.

## Compare emergency policies before adding authority

The challenge does **not explicitly prohibit an owner, pauser, pause mechanism, gateway, or upgrades**. Page 2 prohibits anyone other than the escrow parties, including an owner, from moving escrow funds. Pages 1 and 4 prescribe actor/time transitions and evaluate exact compliance. A concern that pausing those actions changes their availability is our interpretation of those rules, not an express blanket ban on pausing. The no-owner/no-pause baseline is a design recommendation, not a quoted requirement.

These are trade-offs, not claims that no-pause is always safer or that pausing guarantees safety. [OpenZeppelin Pausable](https://docs.openzeppelin.com/contracts/5.x/api/utils#Pausable) gates selected functions; the design must decide which functions and which authorized account controls it.

| Policy | What it can contain | Main residual risk / requirement deviation |
| --- | --- | --- |
| No pause | No administrator can halt legitimate actions; original actor/time rules remain intact. | No circuit breaker if an exploitable defect is discovered. Prevention/testing remain essential. |
| Pause new deposits only | Limits fresh capital entering after activation. Existing cancellation, acceptance, rejection, and expiry exits stay available. | Does not stop an exploit against existing balances; adds authority and an exception to "create always." |
| Pause deposits and beneficiary release, preserve refunds | Can contain a release-specific issue while keeping sender cancellation, beneficiary rejection, and expiry recovery. | Refund/shared-accounting bugs remain exploitable. A pauser can censor rightful beneficiary release until the sender can recover, changing the challenge's rights. |
| Pause all fund-moving actions | Can stop more outflow paths while active. | Also blocks expiry recovery. Lost/compromised pause authority can freeze funds; TTL does not override the gate. |

Concrete counterexample: an escrow expires on day 7, but its recovery function first requires an unpaused contract. At day 8 the sender still cannot recover. Expiry changes time eligibility, not the pause condition. If recovery intentionally bypasses pause, that preserves this exit only under the other contract/token assumptions; it also leaves any defect in the recovery/shared-transfer path reachable.

A pause does not repair an unknown bug in a non-upgradeable contract. Unpause, controlled migration, replacement deployments and existing-user exits need an incident policy; an administrator cannot simply move users' funds under this challenge. There is no unconditional promise that elapsed TTL prevents every lock or loss.

## Why a gateway can add risk

- A gateway-only check is bypassable if users can call an unguarded escrow function directly. Enforcement must exist in every relevant fund-moving path.
- Forwarding changes [msg.sender to the immediate caller](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties), so a wrapper can break sender/beneficiary authorization unless caller identity is deliberately preserved. Do not use tx.origin as a shortcut.
- A shared external controller adds a dependency: a reverted call, misconfiguration or incompatible upgrade can block guarded exits if the policy fails closed; fail-open may defeat protection. A policy lookup does not itself forward the user's call or change its caller. Consider it only if several separate deployments need shared governance.
- Pause authority can be abused, lost, or compromised. It needs a defined scope, recovery/unpause rights, visible events, and tests for authority, direct-call bypass and expiry/refund behavior.

## Current recommendation and open decision

Keep the implemented challenge behavior as the baseline. Future issue #8 can evaluate an emergency policy after this deliverable. Do not add a gateway, pauser or migration mechanism silently. If a circuit breaker is selected, first state its threat, controlled functions, who may pause/unpause, effect on each party's rights and deadlines, and which exits remain callable. For this single deployment, an in-contract policy is the smallest option to evaluate.

Future evaluation must decide whether preserving every required action or adding a privileged incident response exception takes priority. Creation-only pause is the smallest extension, but it is not an answer to every existing-funds exploit. Any selected pause changes acceptance criteria and needs a scoped re-estimate before coding. No parallel fetcher, provisional store, or pause implementation is included in the current delivery budget.
