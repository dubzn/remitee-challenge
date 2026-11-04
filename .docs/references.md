# Source review and role alignment

Reviewed on 2026-11-03. These are English summaries of supplied material, not additional requirements.

## Sources

- Challenge: `Remitee_Challenge_Blockchain_Engineer.pdf`, October 2026, four pages. Local original: `/Users/dub/Downloads/Remitee_Challenge_Blockchain_Engineer.pdf`. All pages were extracted and visually inspected, including the state diagram on page 2.
- Job description: supplied English text at `/Users/dub/.codex/attachments/539735f3-f1f3-4c33-bb1b-efddd2f2bedb/Pasted text.txt`.
- Repository at intake: empty Git repository, no commits or existing architecture, code, tests, or repository instructions.
- Candidate constraints: planning first; no implementation yet; English documents; separate Codex and Claude outputs; at most one week; 5-6 candidate hours per day; Claude `opus`, effort `high`. Candidate confirmed comfort with Foundry and TypeScript for the API.
- Candidate feedback selected PostgreSQL, asked for a reuse assessment and OWASP reentrancy guidance, and requested concrete explanations of event recovery, API state/time/filtering, and future transaction failure visibility. See [worked examples](design-review.md). These additions do not silently become challenge requirements.

The challenge is a fictional evaluation exercise. Its legal notice is part of the supplied source; this planning work does not add production or legal requirements.

## Challenge requirements

| Source | Requirement | Planned coverage |
| --- | --- | --- |
| Page 1 | One contract manages many token escrows with sender, beneficiary, token, amount, and ID. | SDD AC1, AC5 |
| Pages 1-2 | Sender cancellation before 2 hours; beneficiary confirmation/rejection before 7 days; sender recovery from 7 days. Four terminal states, no further changes. | AC2-AC4 |
| Page 2 | Positive amount; beneficiary neither zero nor sender; no third party or owner can move escrow funds. | AC1, AC3 |
| Page 2 | Per-escrow ERC-20 selection, including tokens that return no boolean from transfers. | AC1, AC4; token spike |
| Page 2 | State-change events reconstruct escrows without contract storage reads; getter by ID. | AC5 |
| Page 2 | Durable event projection, idempotency, restart recovery, documented reorg treatment. | AC6-AC8; indexer spike |
| Pages 2-3 | Detail endpoint, paginated filtered list, health including last indexed block. | AC9-AC10 |
| Page 3 | API reflects expired-but-unclaimed escrows and remaining sender cancellation eligibility. No transaction signing or custody required. | AC9; API-time spike |
| Page 3 | Solidity 0.8.x; Node.js API, TypeScript recommended; viem or ethers; local Anvil or Hardhat Network. | Proposed stack |
| Pages 3-4 | Contract and API/event tests, one startup command, complete lifecycle demo, English README with assumptions, setup, test commands, HTTP examples, and future improvements. | AC11-AC12 |
| Pages 3-4 | Git repository accessible to evaluators, meaningful commit history, 45-60 minute technical discussion. | Delivery gate |
| Page 4 | AI use permitted; candidate understands and defends the result; prompt outputs included. | Separate output folders and explanation rehearsal |

## Evaluation weights

| Criterion | Weight | Planning implication |
| --- | --- | --- |
| Contract security | 30% | Protect authorization, transfers, accounting, and terminal transitions first. |
| Logic correctness | 20% | Make exact timestamp boundaries and competing actions explicit. |
| Tests | 20% | Integrate tests with every slice, including failure cases. |
| API and indexer | 15% | Demonstrate replay, restart, time-derived state, and reorg policy. |
| Quality and documentation | 15% | Prioritize reproducibility and explainable decisions. |

Security, logic, and tests together account for 70%. Optional features cannot compensate for failures in these areas.

## Use the JD as a quality signal

| JD emphasis | Evidence appropriate to this challenge | Scope boundary |
| --- | --- | --- |
| Solidity/EVM and safe value movement | Small state machine, safe token interactions, adversarial tests, explicit assumptions. | No proxy or custom token product needed. |
| Event indexing and reconciliation | Replayable event projection, transactional checkpoint, block/hash metadata, recovery evidence. | No separate treasury ledger or accounting platform. |
| Operational ownership | Honest health state, restart demonstration, documented failure handling. | No cloud deployment or monitoring platform needed. |
| Testing and CI/CD | Contract tests, indexer integration tests and timeboxed basic CI from the foundation; extended invariant/fuzz work is optional. | No elaborate pipeline or tooling collection. |
| Technical judgment and English | Clear trade-offs, concise English README, retained AI output, candidate explanation. | Do not present AI review as an audit. |
| Custody, stablecoins, cross-chain, regulated operations | Explain where those boundaries would sit in a production system. | No Fireblocks, MPC, CCTP, bridges, compliance engine, or transaction relayer. |

The JD's production experience requirement cannot be established by this exercise alone. The submission can demonstrate judgment, correctness, and operational awareness.

## Primary technical references

Checked on 2026-11-03. Package versions will be selected and pinned when implementation is authorized.

- [OpenZeppelin SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20): supports transfer calls with no return value and reverts on false returns. This wrapper does not establish safe economics for arbitrary token behavior.
- [viem watchContractEvent](https://viem.sh/docs/contract/watchContractEvent): supports event watching with polling/filter behavior and a log-query fallback. Polling is a valid event-observation mechanism; the proposal uses one durable HTTP polling loop rather than a separate live watcher and recovery timer.
- [Foundry Anvil](https://www.getfoundry.sh/anvil/index.html): local EVM node with time and mining controls suitable for the required lifecycle demo.
- [Anvil RPC API](https://foundry-rs.github.io/foundry/anvil/eth/api/struct.EthApi.html#method.evm_set_next_block_timestamp): next-block timestamp controls and explicit mining support the expiry demo. Plan to mine after advancing time, then observe the new head before recovery.
- [OWASP SC05:2025 reentrancy](https://owasp.github.io/www-project-smart-contract-top-10/2025/en/src/SC05-reentrancy-attacks.html): review/test reference for AC4, not an installable dependency.
- [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html), [INSERT conflict handling](https://www.postgresql.org/docs/current/sql-insert.html), [isolation](https://www.postgresql.org/docs/current/transaction-iso.html), and [advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS): durable projection, deduplication, coherent reads, and writer coordination.
- [node-postgres transaction client](https://node-postgres.com/features/transactions): all statements in one transaction must use the same client.
- [Ethereum receipts](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactionreceipt): mined success/failure visibility differs from surviving escrow event logs.

Follow-up references checked on 2026-11-04:

- [Ethereum block time](https://ethereum.org/developers/docs/blocks/#block-time): 12-second slots, with possible missed proposals; do not infer indexer throughput from cadence alone.
- [Ethereum proof-of-stake finality](https://ethereum.org/developers/docs/consensus-mechanisms/pos/#finality): checkpoint-based consensus finality differs from a finite descendant-block delay.
- [OpenZeppelin Pausable](https://docs.openzeppelin.com/contracts/5.x/api/utils#Pausable): gates selected functions; pause authority and exit policy are application decisions.
- [Solidity caller context](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties): msg.sender is the current call's sender, relevant to forwarding gateways.
- [PostgreSQL lock identity](https://www.postgresql.org/docs/current/view-pg-locks.html): advisory locks are database-local; separate schemas do not isolate the same advisory key.
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use): verify action provenance and pin action references to full commit SHAs for the minimal initial workflow. More elaborate dependency-lock tooling is outside this foundation.
- [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/): running containers are not necessarily ready; explicit health checks and bounded application probes are still needed.
