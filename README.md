# Remitee escrow challenge

ERC-20 escrow with an event-backed read API. Stack: Solidity, Foundry, Ponder, PostgreSQL and TypeScript.

## Run locally

With Docker/Compose running, initialize the pinned submodules and start the stack:

```sh
git submodule update --init --depth 1
docker compose --profile app up --build --wait --wait-timeout 120
```

No host Node, npm, Foundry or `.env` file is needed. Startup launches Anvil, PostgreSQL, deployment, indexer and API, then waits for the API at `http://127.0.0.1:3000`; only this port is published.

Run the lifecycle demo, then query the API:

```sh
docker compose --profile app run --rm --no-deps demo
curl http://127.0.0.1:3000/health
curl 'http://127.0.0.1:3000/escrows?limit=20'
curl http://127.0.0.1:3000/escrows/1
curl 'http://127.0.0.1:3000/escrows?status=Released&limit=20'
```

The demo checks all four outcomes, expiry before recovery, receipts, getters, API results and payout balances. It uses unlocked local accounts and a test token, advances Anvil by seven days, and creates new IDs each run. `--no-deps` preserves the running configuration.

Stop the stack:

```sh
docker compose --profile app down
```

Run the startup command again to resume the same chain, deployment and escrows. State is saved in project volumes. See [development and recovery](docs/development.md) for configuration, application-only restarts and an explicit reset.

## Contract rules

One contract manages multiple escrow IDs. Creation funds each escrow atomically after ERC-20 approval. The amount must be positive; the beneficiary cannot be zero, the sender or this escrow. Other contract beneficiaries are allowed.

Every resolution requires an authorized transaction while the escrow is Pending:

| Action | Caller | Execution time | Recipient | Final state |
| --- | --- | --- | --- | --- |
| Cancel | Sender | Before creation + 2 hours | Sender | CancelledBySender |
| Confirm | Beneficiary | Before creation + 7 days | Beneficiary | Released |
| Reject | Beneficiary | Before creation + 7 days | Sender | Rejected |
| Recover | Sender | At or after creation + 7 days | Sender | Expired |

The beneficiary can settle immediately, including during the cancellation window. The first successful resolution wins; a later cancellation cannot undo a release.

Expiry is passive: time alone never transfers tokens. Until recovery, storage remains Pending and the API reports `ExpiredRecoverable`. Detected transfer failures revert the operation. There is no owner withdrawal, pause, upgrade or rescue path.

## Architecture

Arrows show who initiates each interaction.

```mermaid
flowchart LR
    Client[HTTP client] -->|":3000"| API
    Demo[Wallet / demo] -->|Transactions| Anvil[Anvil RPC + Escrow]
    Deploy[deploy job] -->|Deploy contracts| Anvil
    Deploy -->|Write deployment.json| State[(deployment-state)]

    subgraph application[application container]
        Launcher[Launcher] -->|Starts and supervises| Ponder
        Launcher -->|Starts and supervises| API[Read API]
        API -->|"Check /ready :42069"| Ponder
    end

    Launcher -->|Read deployment.json| State
    Ponder -->|Read events after delay| Anvil
    API -->|Verify block hashes| Anvil
    Ponder -->|Write| DB[(PostgreSQL)]
    API -->|Read-only snapshot| DB
```

| Component | Runs as | Port | Responsibility |
| --- | --- | --- | --- |
| Anvil | `anvil` service | 8545, internal | Local chain and deployed contracts |
| PostgreSQL | `postgres` service | 5432, internal | Indexed data |
| Deploy | One-shot `deploy` service | None | Deploys contracts on first start and saves `deployment.json` |
| Launcher | `application` service, `scripts/indexer.ts` | None | Validates startup, then starts and supervises both processes |
| Ponder | Child process | 42069, internal | Indexes events; the only database writer |
| Read API | Child process, `scripts/read-api.ts` | 3000, published | Public HTTP endpoints |

### How an event reaches the API

1. A transaction emits an event in block N.
2. Ponder can see block N once block N+2 exists (`CONFIRMATION_DELAY=2`).
3. Handlers validate the transition and commit `journal`, `escrows` and `checkpoint` together.
4. `GET /escrows/{id}` captures the latest block and reads `escrows` and `checkpoint` in one snapshot.
5. The API checks block hashes against the chain and derives time-based status from the captured block timestamp.

Deployment identity is verified at startup. For replaced blocks, Ponder rolls back and reprocesses history within a configurable window: 180 seconds by block timestamps. Unrecoverable mismatches block reads until an explicit rebuild into a fresh database schema. RPC failures return 503 without deleting data. The shared launcher stops both processes if either exits unexpectedly.

## Data model

Ponder creates and writes three application tables in one PostgreSQL schema (default `escrow_index`). The API only reads them.

| Table | One row per | Used for |
| --- | --- | --- |
| `escrows` | Escrow | Current state, filtered and paginated by the API |
| `journal` | Contract event | Deduplication and audit trail, keyed by `(transaction_hash, log_index)` |
| `checkpoint` | Indexer (single row) | Last processed block and hash, read in the same snapshot as `escrows` |

The `_ponder_*` and `_reorg__*` tables and the `ponder_rpc_cache_*` schema belong to Ponder. See [columns and indexes](docs/postgres-models.md).

## Repository map

```text
contracts/src/            Escrow contract and interface
contracts/test/           Unit and adversarial-token tests
apps/indexer/
  ponder.config.ts        Chain, contract and RPC wiring
  ponder.schema.ts        Database tables
  src/index.ts            Event and block handlers
  src/api/index.ts        Empty Hono app for Ponder's internal server
  projection.ts           Event rules, independent of Ponder
  store.ts                Ponder database adapter
  config.ts               Environment and deployment settings
  rpc.ts                  RPC client, deployment check, confirmation delay
  read-model.ts           Verified read: head, snapshot, chain recheck
  api/                    Public HTTP API: routing, validation, SQL, health
  test/                   Unit, integration and HTTP acceptance tests
scripts/
  indexer.ts              Starts and supervises Ponder and the API
  read-api.ts             API entry point
  deploy-local.ts         Local deployment
  demo.ts                 Full escrow lifecycle demo
docs/                     API, database, flows and operations
```

## Decisions

| Decision | Alternative | Why / trade-off |
| --- | --- | --- |
| Ponder | A custom RPC polling worker | I chose existing restart, transaction and fork-recovery machinery over maintaining it myself. Local tests covered duplicates, interrupted writes and reorganizations. |
| Separate read API | Routes inside Ponder's built-in API | I kept the public contract, read transaction and chain checks in a dedicated process. The cost is a second process, SQL against Ponder-managed tables and a shared lifecycle through the launcher. |
| PostgreSQL | PGlite, Ponder's embedded default | The indexer and API are separate processes that need one shared database, so I use Ponder's PostgreSQL backend. |
| `CONFIRMATION_DELAY=2` extra blocks | Immediate indexing, or waiting for network finality | I chose a small local delay to exercise confirmation handling. Block 100 is indexed only after block 102 exists. It reduces exposure to recent forks but does not guarantee finality; it is configurable and has not been tuned for a live network. |
| Immediate beneficiary decisions | An exclusive 2-hour sender cancellation window | I prioritize immediate settlement; the cost is that confirmation can beat cancellation. |
| Reject this escrow as beneficiary | Reject only zero and sender, as required | This contract cannot call its own beneficiary actions. The extra check prevents an escrow whose beneficiary cannot decide; other contracts remain allowed. |
| Exact incoming token amount | Record fee-adjusted deposits | I keep the promised amount equal to the funding, avoiding different deposit/payout amounts. No-return tokens remain supported. |
| No pause or upgrades | Administrator controls or a proxy | I avoided additional authority, exit and migration rules within the challenge. These require separate design. |

## Read API

| GET | Purpose |
| --- | --- |
| `/escrows/{id}` | Detail, transaction hashes and indexing information |
| `/escrows` | Sender/beneficiary/status filters, newest ID first, limit/offset pagination |
| `/health` | Dependency status and last indexed block |
| `/openapi.yaml` | [OpenAPI contract](docs/api/openapi.yaml) |

The API serializes IDs, amounts, block numbers and Unix-second timestamps as decimal strings. Filters run before pagination; expiry uses chain time. Responses include the latest observed block, last indexed block and indexing lag. A 404 means no escrow was found in the indexed blocks; newer transactions may still be waiting. Unverifiable reads return 503.

`canCancel` and `canRecover` describe sender eligibility by recorded status and observed time, without authenticating the caller or guaranteeing transaction success. See [HTTP details](docs/api/README.md).

Trimmed `GET /escrows/1` response after the demo:

```json
{
  "escrow": {
    "id": "1",
    "amount": "10",
    "onChainStatus": "CancelledBySender",
    "effectiveStatus": "CancelledBySender",
    "canCancel": false,
    "canRecover": false
  },
  "observation": {
    "confirmationDelay": 2,
    "headLag": "2",
    "eligibleBacklog": "0"
  }
}
```

## Verification

Use Node 24.14.1/npm 11.11.0, install dependencies with `npm ci`, then run:

```sh
npm run lint
npm run check
npm run contracts:check
npm run indexer:typecheck
npm run indexer:unit
npm run api:spec
npm run api:unit
npm run indexer:test
npm run app:test
npm run contracts:docs
```

Checks cover deadlines, authorization, adversarial tokens, reentrancy, write interruption, restart, forks and HTTP/OpenAPI agreement. Docker acceptance runs the full setup/demo in isolated projects.

## Optional work selected

| Addition | Why |
| --- | --- |
| CI — optional in the challenge | I chose repeatable contract, API and Docker checks on pushes and pull requests to catch regressions. Includes Biome formatting, imports and lint, Solidity formatting and TypeScript checks. |
| OpenAPI — documentation extra | Response validation keeps the HTTP specification and implementation aligned. Swagger UI is not included. |
| NatSpec + `forge doc` — documentation extra | Rules, deadlines and errors stay alongside the interface and in a generated reference. |

I chose these over the other suggested bonuses to prioritize reproducible local execution and an auditable API contract. Contract tests are example-based boundary and adversarial-token cases; fuzz and invariant tests are the first addition I would make.

## Assumptions and limitations

- I assume honest, exact-transfer ERC-20s. Funding checks the amount received; payout recipient balances are not rechecked. Fees, rebasing and dishonest success reports are unsupported.
- Issuer pauses or blacklists can block every exit, including expiry recovery, indefinitely. The contract cannot bypass them or guarantee unconditional refunds.
- I trust the RPC to provide complete history, and keep its endpoint and the deployment fixed until restart. A reorganization after the last check remains possible; no atomic check spans database and chain. API state can lag transactions.
- I target local/internal consumers. The API is anonymous, read-only and published on loopback in Compose. There is no wallet UI, transaction submission, testnet deployment or production audit.
- Incompatible saved chain/database state is rejected rather than silently reset.

## Improvements I would evaluate

- Fuzz and invariant tests for the contract, starting with: for each token, the escrow's balance covers the sum of Pending deposits.
- Service authentication and authorization for an internal deployment: [#14](https://github.com/dubzn/remitee-challenge/issues/14).
- Caching after measurement, preserving block verification and time-based eligibility: [#13](https://github.com/dubzn/remitee-challenge/issues/13).
- Rules for accepting tokens and monitoring of issuer restrictions before supporting real funds.
- Pause/upgrades after defining authority, exit rights and migration risks: [#8](https://github.com/dubzn/remitee-challenge/issues/8), [#9](https://github.com/dubzn/remitee-challenge/issues/9).

## Reference docs and AI history

[Behavior checklist](docs/sdd/escrow.md) · [Contract flows](docs/contract-flows.md) · [PostgreSQL models](docs/postgres-models.md) · [Development/recovery](docs/development.md) · [NatSpec guide](contracts/README.md).

Codex assisted with implementation and verification; Claude provided reviews. The [AI appendix](docs/ai-log/README.md) retains historical prompts, responses and planning, separate from current instructions.
