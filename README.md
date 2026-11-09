# Remitee escrow challenge

One contract manages ERC-20 escrows with sender cancellation, beneficiary confirmation/rejection and explicit sender recovery after expiry. Ponder indexes events into PostgreSQL; the read API exposes verified detail/list/health observations and time-derived eligibility. The complete local startup and lifecycle demo run in Docker. See [progress and verification](.docs/progress.md) for local evidence versus observed published CI. Emergency pause and upgradeability remain future improvements [#8](https://github.com/dubzn/remitee-challenge/issues/8)/[#9](https://github.com/dubzn/remitee-challenge/issues/9).

With Docker/Compose running and the pinned submodules initialized, start the complete application with one Compose command. Host Node/npm/Foundry and a .env file are not required:

```sh
git submodule update --init --depth 1
docker compose --profile app up --build --wait --wait-timeout 120
```

Run the four-outcome demo, then inspect the read API:

```sh
docker compose --profile app run --rm --no-deps demo
curl http://127.0.0.1:3000/health
curl 'http://127.0.0.1:3000/escrows?limit=20'
```

The demo uses local unlocked Anvil accounts and a test-only token, prints actual statuses/hashes/balance evidence, and advances only the disposable chain clock. Rerun it sequentially to create new escrow IDs. The [Docker guide](.docs/docker-demo.md) covers configuration, logs, application restart and explicit project reset after losing Anvil's session. Only the API is published on localhost; no private key or remote network is required.

- [Local setup, commands and verification](.docs/local-development.md)
- [Complete Docker startup and demo](.docs/docker-demo.md)
- [Current progress and next slice](.docs/progress.md)
- [Specification and planning index](.docs/README.md)
- [Indexer architecture and provider alternatives](.docs/indexer-design.md)
- [PostgreSQL models](.docs/postgres-models.md)
- [Read API contract, queries, health and examples](.docs/api/README.md)
- [Contract reference and generation commands](contracts/README.md)
- [Token compatibility and external freeze limits](.docs/token-support.md)
- [Ponder proof and decision: Ponder selected](.docs/outputs/codex/2026-11-06-ponder-decision.md)
- [Work tracker](https://github.com/dubzn/remitee-challenge/issues)

For host development and test commands below, use Node 24.14.1/npm 11.11.0 and Docker Compose. After `npm ci`, `npm run infra:up` starts the separate remitee-local Anvil/PostgreSQL project; `npm run check` verifies the isolated foundation. The Docker reviewer path above uses its own Compose project and needs no host npm install.

Initialize pinned Solidity dependencies with `git submodule update --init --depth 1`, then run `npm run contracts:check`. This checks formatting, build, 62 tests and the compiled ABI in the pinned Foundry container, independently of Anvil/PostgreSQL. Native Foundry users can run `cd contracts` and `forge test -vv`.

Run `npm run contracts:docs` to generate and verify the contract Markdown/HTML reference in ignored `.local/contracts-docs`. Serve it with `python3 -m http.server 8000 --bind 127.0.0.1 --directory .local/contracts-docs/book`.

Application: `npm run indexer:deploy:local`, then `npm run indexer:start` with `.env` from `.env.example`. The shared launcher starts Ponder on INDEXER_PORT (default 42069) and the consumer API on API_PORT (default 3000), both loopback. See [runtime/recovery](.docs/indexer-runtime.md) and [external CLI wallets/testnet](.docs/testnet-wallet.md). Run `npm run indexer:unit`, `npm run api:spec`, `npm run api:unit` and `npm run indexer:test` for application checks. The archived PoC is not the runtime.

Run `npm run app:test` to verify the full Docker path in an isolated project, including demo repetition, restart, dependency failure and incompatible-state refusal. The driver uses Node built-ins only; CI runs it without installing host app dependencies. Test commands clean only their own disposable resources.

```sh
curl http://127.0.0.1:3000/escrows/1
curl 'http://127.0.0.1:3000/escrows?status=ExpiredRecoverable&limit=20&offset=0'
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/openapi.yaml
```
