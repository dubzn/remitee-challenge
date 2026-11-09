# Ponder indexer runtime

Scope: S2 indexer and S3 read API. Ponder 0.18.5 is pinned in the npm workspace `apps/indexer`. The archived experiment remains independent. Public filtering, pagination and time-derived eligibility are implemented on a separate consumer listener; internal observation endpoints remain diagnostic.

For complete reviewer setup and the four-outcome demo entirely in Docker, use the [S4 guide](docker-demo.md). Commands below retain the host development path.

## Local commands

Use pinned Node/npm, Docker and initialized Solidity submodules. The local deploy command accepts only loopback RPC and chain 31337; it uses Anvil's unlocked test accounts, not a backend signing key.

```sh
git submodule update --init --depth 1
npm ci
npm run infra:up
cp -n .env.example .env
npm run indexer:deploy:local
npm run indexer:start
```

The deploy command compiles in the pinned Foundry container, checks compiled event signatures, deploys Escrow and a test-only MockERC20, writes `.local/deployment.json` and mines the configured CONFIRMATION_DELAY additional blocks (default 2; zero skips mining). Repeating it validates/reuses the descriptor without sending another deployment transaction. If existing chain/data are incompatible, it refuses; it does not reset the foundation or overwrite a descriptor. Stop the indexer before an explicit joint infrastructure reset. Preserve the old descriptor for diagnosis, then select a fresh descriptor/schema for the new chain.

Docker --compose deployment uses the same local logic with build-time packaged artifacts and a descriptor volume.

In another terminal:

```sh
curl http://127.0.0.1:42069/observed/health
curl http://127.0.0.1:42069/observed/escrows
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/escrows/1
curl 'http://127.0.0.1:3000/escrows?status=ExpiredRecoverable&limit=20'
curl http://127.0.0.1:3000/openapi.yaml
```

The /observed paths are internal. Ponder's reserved /health and /ready report engine state and do not replace consumer application health. npm run indexer:start launches both listeners on loopback: the consumer defaults to port 3000 and the engine to 42069. See the [HTTP contract](api/README.md). The launcher shares the computed startup floor and resolved policy with both children, stops siblings on any unexpected child exit and recomputes context on restart. The API entry refuses a missing floor. This host command assumes infrastructure/deployment; the S4 Compose profile orchestrates those steps. API_HOST can select 0.0.0.0 for container port forwarding; the host defaults and native Ponder listener remain loopback.

## Configuration and data scope

Root commands load `.env` when present; exported environment variables take precedence. No signer/private-key variable is consumed by the indexer.

| Variable | Meaning |
| --- | --- |
| RPC_URL | Read-only JSON-RPC endpoint; testnet credentials stay outside Git. |
| DATABASE_URL | PostgreSQL connection string. Local values in `.env.example` are development-only. |
| DEPLOYMENT_FILE | Versioned descriptor: chain ID/genesis, Escrow address, deployment block/hash/transaction and compiled runtime code hash. |
| INDEXER_SCHEMA | Explicit data scope, default escrow_index. New replay uses a new schema; no automatic deletion. |
| CONFIRMATION_DELAY | Additional blocks after inclusion before ingestion; integer 0..10000, default 2. Zero is explicit no-extra-delay mode. Not consensus finality. |
| REORG_WINDOW_SECONDS | Positive recovery window between block timestamps, default 180. Independent of block admission depth. |
| INDEXER_POLL_MS | Poll interval, default 1000 ms. |
| INDEXER_PORT | Internal loopback HTTP port, default 42069. |
| API_PORT | Consumer loopback HTTP port, default 3000; must differ from INDEXER_PORT. This operational setting does not change the persisted data scope. |
| API_HOST | Consumer bind: 127.0.0.1 by default; 0.0.0.0 in Docker. Only these values are accepted, independently of data scope. Compose publishes only loopback on the host. |

### Configuring admission depth

CONFIRMATION_DELAY already controls the RPC view supplied to Ponder, the startup catch-up floor and the observation's delay/backlog checks. The 2 is a fallback and example value, not a fixed runtime policy. Set the value in .env before starting the indexer; an exported value overrides .env. This setting is read at process startup, not hot-reloaded.

The value counts additional descendant blocks, excluding the inclusion block: an event in block 100 with delay 2 becomes eligible when head reaches 102. This differs from confirmation-count conventions that count inclusion as one. Actual API delay also includes polling, RPC and processing time; a block-time estimate is not an end-to-end freshness guarantee.

Changing delay changes the persisted policy scope key. Stop the old instance and use a fresh schema with explicit replay; do not edit its checkpoint or reuse rows admitted under the old policy. For example, with a validated deployment and an unused schema:

```sh
CONFIRMATION_DELAY=6 INDEXER_SCHEMA=escrow_delay_6 npm run indexer:start -- --replay
```

Keep the chosen settings in .env for subsequent restarts. A fresh local deployment mines the configured extra setup blocks. Reusing a descriptor sends no transactions or mining; increasing delay can still require explicitly mining enough Anvil blocks before readiness. For Docker policy changes, a fresh explicitly selected project/session is the simplest local path. Polling alone does not advance an idle local chain. The recovery window remains a separate seconds-based setting.

Startup validates chain, genesis, deployment receipt/block, contract address and runtime code against the descriptor. Before spawning the engine, the launcher captures a startup floor at least as high as persisted progress and the current eligible head. Public observation stays unavailable until replay reaches that floor, preventing temporary restart rollback from being published as a new escrow outcome. It also compares the persisted scope key, including projection version/admission/recovery policy, before starting Ponder. An incompatible scope is refused without repointing or deleting rows. Local and testnet data must use separate databases/scopes.

Ponder owns the writer lease, internal cursor, transactions and rollback log. App tables are journal, escrows and checkpoint. A public block handler updates checkpoint even for empty blocks. Only the Ponder persistence adapter writes through context.db. The query adapter uses read-only repeatable-read transactions on a separate pool. Projection rules have no SQL/framework dependency.

Identical event replay is a no-op. Identity collisions with different raw/decoded content fail. New terminal events require an existing Pending escrow and the correct actor. Journal retains transaction/log position, block/hash, actor, arguments and raw topics/data; projection retains successful creation/resolution transaction hashes. A malformed RPC response containing duplicate positions is rejected by Ponder rather than treated as a valid delivery batch.

The delayed RPC view handles numbered/latest/safe/finalized block reads and range/hash log requests. Hash-based filters are validated without adding incompatible range parameters. The observer refuses transaction-submission methods. This is one engine with a delayed view, not another polling worker.

## Reads and recovery

Data and checkpoint share one SQL snapshot. The read guard validates current identity, canonical checkpoint and captured head, then rechecks hashes before responding. Results include observed head/time, indexed progress, delay, recovery window, head lag and eligible backlog. Canonical older prefixes are allowed and reported with their progress. RPC failure, unavailable/noncanonical checkpoint or wrong scope returns 503.

Inside the configured window Ponder rolls back/replays automatically. Beyond recovery, application reads stay unavailable. Stop the old instance, validate the deployment, select an unused schema and replay explicitly:

```sh
INDEXER_SCHEMA=escrow_replay_1 npm run indexer:start -- --replay
```

`--replay` refuses an existing checkpoint table; it never drops tables. It creates a replacement scope, so switch consumers only after validating its observation. Keep one active publisher for a selected deployment/scope. Do not reset data merely because RPC timed out. A changed deployment requires a fresh validated descriptor and data scope, not reuse of old rows.

RPC and SQL cannot form one atomic cross-system snapshot. A reorg after the last check remains possible; the next read must revalidate. The source is trusted for completeness. No production throughput/finality guarantee or automatic deep-reorg repair is claimed.

## Verification

```sh
npm run typecheck
npm run indexer:typecheck
npm run indexer:unit
npm run api:spec
npm run api:unit
npm run indexer:test
```

Typecheck generates ignored Ponder ambient types through supported codegen. Integration uses isolated loopback Anvil/PostgreSQL resources named remitee-indexer-check-*, actual contracts and the shared application entrypoint. It now covers public HTTP/schema checks, time/filter/pagination behavior, read snapshots, dependency failures and sibling lifecycle as well as S2 recovery. Crash injection is a test-owned PostgreSQL trigger/lock, not a production switch. Evidence stays under ignored .local and resources are removed in finally. S3 has [published CI evidence on 80f1367](https://github.com/dubzn/remitee-challenge/actions/runs/42340576160). The new S4 Docker job is configured separately; no remote success for those changes is inferred from an older run.

For optional external signing/testnet use, see [wallet and testnet walkthrough](testnet-wallet.md).
