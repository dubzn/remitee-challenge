# Development and recovery

The [README](../README.md) covers Docker startup/demo and the decisions/limits. I use this page for configuration, host development and recovery details.

## Docker operations

```sh
docker compose --profile app logs --tail 100 deploy application
```

I set configuration before the first startup and keep it exported or in `.env` for later `up` commands. For a different host port:

```sh
export API_PORT=3001
docker compose --profile app up --build --wait --wait-timeout 120
```

The deployment job builds/reuses one per-project image with the application/demo, validates chain/build identity and mines the selected setup delay. The API mounts the deployment descriptor read-only. Demo preflight checks readiness/policy before sending transactions.

| Setting | Meaning |
| --- | --- |
| API_PORT | Docker host port, default 3000; container API stays on 3000. In host development, listener port. |
| API_HOST | Host default 127.0.0.1; Docker uses 0.0.0.0 internally and publishes only host loopback. |
| CONFIRMATION_DELAY | Extra blocks after inclusion, 0..10000, default 2; startup-time policy, not finality. |
| REORG_WINDOW_SECONDS | Block-timestamp recovery window, 1..600, default 180. |
| INDEXER_POLL_MS | Poll interval, 100..60000ms, default 1000. |
| INDEXER_SCHEMA | Selected database schema, default escrow_index. |
| INDEXER_PORT | Native Ponder port; 42069 inside Docker, never published by the app profile. |
| DEPLOYMENT_FILE | Validated descriptor; /state/deployment.json in Docker. |
| RPC_URL / DATABASE_URL | Docker fixes these to local services. Host development uses explicit values from .env/environment. |

I do not mount host source, private keys or the Docker socket into the application. First-build downloads and cached images are expected. Local execution used Docker Engine 29.1.3/Compose 5.0.0; I have not established a minimum older Compose version.

## Session loss and replay

Anvil is ephemeral; PostgreSQL and the descriptor have named volumes. If stop/down/Docker restart loses the chain, old metadata/data must not be reused. After inspecting the mismatch, I select a fresh project or use the [explicit reset in the README](../README.md#run-locally). It deletes the selected project's database/descriptor. I keep the same project selection (`-p` or COMPOSE_PROJECT_NAME) across commands. The separate host development project is remitee-local.

For a canonical deployment with an unrecoverable projection or deliberately changed policy, I can stop the old publisher, validate the descriptor, and replay into an unused schema. On the host path:

```sh
INDEXER_SCHEMA=escrow_replay_1 npm run indexer:start -- --replay
```

`--replay` refuses an existing checkpoint table; it never drops tables. I keep the selected settings for later restarts and switch readers only after verified readiness. For this Docker fixture, a fresh explicit project/session is the simplest policy-change path. An RPC timeout alone does not prove a reorg or justify deleting history. Native Ponder /health and /ready remain internal engine signals; consumer reads use the public API.

## Host development and tests

I use Node 24.14.1/npm 11.11.0. After initializing submodules:

```sh
npm ci
npm run infra:up
cp -n .env.example .env
npm run indexer:deploy:local
npm run indexer:start
```

Fresh local deployment mines the configured delay; descriptor reuse sends no transactions or mining. An idle Anvil does not advance by waiting. Increasing delay against an existing chain may require explicitly mining enough additional blocks. I use distinct API ports when running host and Docker applications together.

`infra:up` starts/reuses healthy remitee-local infrastructure. `infra:down` stops it; `infra:reset` explicitly removes that project's data. Stopped/partial sessions are refused rather than silently reset.

The [README test commands](../README.md#verification) are the same checks wired into CI. Contract checks run in the pinned Foundry image without Anvil/DB. Integration and Docker acceptance create isolated projects/databases and remove only their own resources; images/build cache remain cached. The dependency-free Docker test driver uses host Node for assertions, while all application/deployment/demo execution remains inside containers.

For generated contract reference:

```sh
npm run contracts:docs
python3 -m http.server 8000 --bind 127.0.0.1 --directory .local/contracts-docs/book
```

Generated files are ignored. I serve the book at the HTTP root because inherited links are root-relative. [NatSpec guide](../contracts/README.md).
