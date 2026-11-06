# Remitee escrow challenge

The escrow core, contract tests and local infrastructure are implemented. Deployment, the indexer, API and full lifecycle demo remain later slices. The November 5 contract milestone is closed. Emergency pause and upgradeability are possible future improvements in [#8](https://github.com/dubzn/remitee-challenge/issues/8) and [#9](https://github.com/dubzn/remitee-challenge/issues/9), outside this deliverable.

- [Local setup, commands and verification](.docs/local-development.md)
- [Specification and planning index](.docs/README.md)
- [Proposed indexer design and provider alternatives](.docs/indexer-design.md)
- [Proposed PostgreSQL models](.docs/postgres-models.md)
- [Ponder proof and decision: Ponder selected](.docs/outputs/codex/2026-11-06-ponder-decision.md)
- [Work tracker](https://github.com/dubzn/remitee-challenge/issues)

Use Node 24.14.1/npm 11.11.0 and Docker Compose with a running Docker engine. After `npm ci`, `npm run infra:up` starts local Anvil/PostgreSQL; `npm run check` verifies the isolated foundation. No production credentials are required.

Initialize pinned Solidity dependencies with `git submodule update --init --depth 1`, then run `npm run contracts:check`. This checks formatting, build, 62 tests and the compiled ABI in the pinned Foundry container, independently of Anvil/PostgreSQL. Native Foundry users can run `cd contracts` and `forge test -vv`.
