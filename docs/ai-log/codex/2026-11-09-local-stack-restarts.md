# Local stack restart fix

The reported deploy failure exposed inconsistent persistence: PostgreSQL and the descriptor survived, while Anvil lost the chain. Moving a reset warning into the README did not fix the startup workflow.

I chose to retain all three stores instead of silently discarding data. Compose now saves Anvil history/historical states in a named volume, snapshots every second and flushes on SIGINT. The pinned Anvil 1.4.1 loader also required a deterministic genesis timestamp and clock alignment after validated deployment reuse. Clock alignment neither mines nor sends transactions. The fixed local timestamp also matches the existing fixture, allowing migration without rewriting its history.

## Evidence

- The new stop/up regression failed against the original configuration with deployment_identity_mismatch.
- State persistence alone passed stop/up but failed down/up. Inspection showed multiple genesis blocks with different timestamps accumulating across reloads; a fixed timestamp prevents this.
- A further check caught new transactions rewinding time after reload. The final demo verifies every new creation timestamp is later than the restored head.
- Final Docker acceptance passed 13 checks: three demos, stop/up, down/up, exact history/receipt/state comparisons, monotonic timestamps and refusal after explicit chain replacement. Foundation restart/smoke checks, root/indexer types, Biome and all 18 indexer/HTTP integration observations passed.
- The existing local fixture was exported before migration, including historical states and a SQL backup. Its four escrows, getters, balances, nonces, descriptor and deployment receipt matched exactly after restoration. Backups and command logs are ignored under .local/anvil-persistence-2026-11-09.

The README now presents startup, demo and shutdown directly. Recovery details stay in the development guide. Snapshot persistence is not atomic with PostgreSQL under forced termination or volume loss; identity/checkpoint checks remain enabled. No contract or HTTP behavior changed. No new Claude review or remote CI result is claimed.

Source checks: [Anvil 1.4.1 state loading](https://github.com/foundry-rs/foundry/blob/v1.4.1/crates/anvil/src/eth/backend/mem/mod.rs#L1045), [block loading](https://github.com/foundry-rs/foundry/blob/v1.4.1/crates/anvil/src/eth/backend/mem/storage.rs#L417) and [mining clock](https://github.com/foundry-rs/foundry/blob/v1.4.1/crates/anvil/src/eth/backend/time.rs#L40).
