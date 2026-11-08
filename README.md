# Remitee escrow challenge

The escrow core, local deployment, Ponder indexer and read API are implemented. S3 passed local Anvil/PostgreSQL/HTTP acceptance and [published CI on 80f1367](https://github.com/dubzn/remitee-challenge/actions/runs/42340576160). Contract NatSpec and reference generation have separate November 8 checks; that new CI step must not be confused with the earlier run. Full setup/demo remains S4. Emergency pause and upgradeability are future improvements in [#8](https://github.com/dubzn/remitee-challenge/issues/8)/[#9](https://github.com/dubzn/remitee-challenge/issues/9), outside this deliverable.

- [Local setup, commands and verification](.docs/local-development.md)
- [Current progress and next slice](.docs/progress.md)
- [Specification and planning index](.docs/README.md)
- [Indexer architecture and provider alternatives](.docs/indexer-design.md)
- [PostgreSQL models](.docs/postgres-models.md)
- [Read API contract, queries, health and examples](.docs/api/README.md)
- [Contract reference and generation commands](contracts/README.md)
- [Token compatibility and external freeze limits](.docs/token-support.md)
- [Ponder proof and decision: Ponder selected](.docs/outputs/codex/2026-11-06-ponder-decision.md)
- [Work tracker](https://github.com/dubzn/remitee-challenge/issues)

Use Node 24.14.1/npm 11.11.0 and Docker Compose with a running Docker engine. After `npm ci`, `npm run infra:up` starts local Anvil/PostgreSQL; `npm run check` verifies the isolated foundation. No production credentials are required.

Initialize pinned Solidity dependencies with `git submodule update --init --depth 1`, then run `npm run contracts:check`. This checks formatting, build, 62 tests and the compiled ABI in the pinned Foundry container, independently of Anvil/PostgreSQL. Native Foundry users can run `cd contracts` and `forge test -vv`.

Run `npm run contracts:docs` to generate and verify the contract Markdown/HTML reference in ignored `.local/contracts-docs`. Serve it with `python3 -m http.server 8000 --bind 127.0.0.1 --directory .local/contracts-docs/book`.

Application: `npm run indexer:deploy:local`, then `npm run indexer:start` with `.env` from `.env.example`. The shared launcher starts Ponder on INDEXER_PORT (default 42069) and the consumer API on API_PORT (default 3000), both loopback. See [runtime/recovery](.docs/indexer-runtime.md) and [external CLI wallets/testnet](.docs/testnet-wallet.md). Run `npm run indexer:unit`, `npm run api:spec`, `npm run api:unit` and `npm run indexer:test` for application checks. The archived PoC is not the runtime.

```sh
curl http://127.0.0.1:3000/escrows/1
curl 'http://127.0.0.1:3000/escrows?status=ExpiredRecoverable&limit=20&offset=0'
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/openapi.yaml
```
