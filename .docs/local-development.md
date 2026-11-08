# Local foundation and verification

Infrastructure and contract-core commands, updated November 7, 2026. Foundation tracks [#1](https://github.com/dubzn/remitee-challenge/issues/1)/[#2](https://github.com/dubzn/remitee-challenge/issues/2); contracts track [#3](https://github.com/dubzn/remitee-challenge/issues/3). Deployment, indexer and read API are now implemented; use the [application runtime guide](indexer-runtime.md) after the foundation setup below. Full setup/demo orchestration remains S4.

## Prerequisites and quick start

Install Docker with Compose and start its engine. Use Node 24.14.1 and npm 11.11.0 (bundled with that Node release). With nvm:

```sh
nvm install
nvm use
npm ci
npm run infra:up
```

`infra:up` builds the pinned tools image, waits up to 60 seconds for service health and checks real RPC/SQL connectivity. The default Compose project is always `remitee-local`. This is the first part of the eventual one-command application startup, not completed AC11.

## Commands

| Command | Behavior |
| --- | --- |
| `npm run infra:up` | Start a fresh project or reuse both already-running healthy services; verify connectivity without deleting data. Stopped/partial projects require explicit reset. |
| `npm run infra:probe` | Non-mutating RPC chain ID and SQL connectivity checks; failure exits nonzero. |
| `npm run infra:down` | Stop local containers, retaining the PostgreSQL volume; the Anvil session is disposable. |
| `npm run infra:reset` | Explicitly remove only this project's containers, network, chain session and DB volume. Both datasets are discarded; next up is fresh. |
| `npm run typecheck` | Strict TypeScript checking; no Docker needed. |
| `npm run check` | Typecheck plus real isolated foundation tests, including failure and cleanup. |
| `npm run contracts:check` | Format/build/tests and compiled ABI checks in the same pinned Foundry image; no Anvil or DB services. |
| `npm run contracts:docs` | Generate/check NatSpec Markdown/HTML in ignored `.local/contracts-docs`, using pinned Foundry; no Anvil or DB services. [Reference guide](../contracts/README.md). |
| `npm run db:sql -- db/migrations/<file.sql>` | Apply a reviewed SQL file atomically to the local DB with stop-on-error. No migrations exist yet. |

`db:sql` is a thin PostgreSQL entry point, not a versioned migration runner: it records no history, does not auto-discover files, and does not make arbitrary SQL idempotent. It accepts only reviewed `.sql` files inside `db/migrations`. Files must contain transaction-compatible SQL without transaction-control statements or psql meta-commands; there is no SQL parser enforcing that convention. For these files a statement error rolls back and returns failure. An explicit `ROLLBACK` can instead exit successfully. Add schema/migration policy with the indexer issue; no CI migration coverage is claimed.

## Services and pinned tools

| Component | Version | Access |
| --- | --- | --- |
| Node / npm | 24.14.1 / 11.11.0 | Host and tools image; `.nvmrc`, engines and lockfile |
| TypeScript | 5.9.3 | Locked dev dependency; native Node type stripping runs scripts, `tsc` checks them |
| Foundry / Anvil | 1.4.1 | Pinned multi-architecture image; chain ID 31337, Cancun EVM |
| Solidity | 0.8.30 | Pinned in `contracts/foundry.toml`; implemented core and 62 contract tests |
| PostgreSQL | 17.11-alpine3.23 | Pinned multi-architecture image |
| OpenZeppelin / forge-std | 5.7.0 / 1.16.2 | Git submodules pinned to commit IDs; Foundry lockfile records those revisions |

All three base images use immutable index digests, supporting both local arm64 and CI amd64. Node package versions and transitive integrity are in `package-lock.json`.

Initialize contract dependencies after cloning: `git submodule update --init --depth 1`. The two top-level gitlinks are pinned, not moving branches. The contract check mounts source read-only, copies it into a disposable container's `/tmp`, runs format/build/tests and rejects empty/skipped/failing tests or an unexpected mutating ABI. It removes only its generated container, including on ordinary failures/timeouts. The compiler download requires network access on a fresh run. The optional native equivalent is `cd contracts`, then `forge fmt --check src test` and `forge test -vv` with Foundry 1.4.1. Native builds use ignored `contracts/out` and `contracts/cache`.

Development endpoints are `http://127.0.0.1:8545` and `postgres://remitee:remitee_local_only@127.0.0.1:5432/remitee`. These are disposable local credentials. Inside Compose, services use `anvil:8545` and `postgres:5432`. Only `compose.local.yaml` publishes ports, always on loopback; tests never load that file. If a local port is occupied, stop the conflicting local service or adjust only that override.

## Test isolation and actual assertions

`npm run check` creates a unique `remitee-check-*` project, with no host ports, separate Anvil and a separate PostgreSQL database/server. It cleans its own containers/network/volumes in `finally`. CI provides a stable run/attempt project name and an additional unconditional cleanup step. No global Docker prune or external resource deletion occurs. Build cache and project tools-image tags remain cached locally; CI runners are disposable.

The checks assert:

- RPC chain ID, an exact chosen next-block timestamp and mining exactly N blocks.
- Snapshot/revert restores the prior head; remine with a different timestamp yields the same height and different block hash. This is a future reorg fixture, not an indexer recovery test.
- A real SQL insert is undone by rollback; two clients contend for one session advisory key and acquire it after release.
- Stopping PostgreSQL causes the actual probe to exit 1 with `DB_UNAVAILABLE` while RPC is still ready. Restart restores connectivity.

Time/mining are global per Anvil. Run future time-travel suites serially or give each worker its own instance. PostgreSQL advisory keys are database-local, not schema-local; use a separate database per future parallel worker. Foundry unit tests use their own EVM and do not depend on Compose.

For an interrupted manual test, use its printed project name explicitly:

```sh
REMITEE_CHECK_PROJECT='remitee-check-<printed-suffix>' npm run infra:clean-check
```

Replace `<printed-suffix>` with the actual suffix (without angle brackets). Cleanup rejects other prefixes and never guesses a project. Normal checks clean themselves.

## Data lifetime and scope limits

Anvil is ephemeral; PostgreSQL uses a named volume. An initial snapshot experiment lost the chain head on restart; inspection found the mounted directory was not writable by the image's non-root user, so no state file had been produced. That experiment did not establish state-file archival behavior. Rather than adding chain persistence, the final foundation uses disposable sessions: `infra:down` stops both, and a later `infra:up` refuses stopped/partial projects without deleting anything. Run `infra:reset` explicitly and then `infra:up` for a fresh session. Repeating up while both services remain healthy only rebuilds tools/probes them; it does not recreate them. Apply service configuration changes through reset.

This foundation deliberately supports disposable sessions, not resumable chain archives. Manual Docker/RPC resets can still diverge from stored DB data. No automatic deletion or claim of canonical history preservation is made.

No application projection exists at this stage. Before storing/serving it, issue #4 must validate deployment anchor and checkpoint hashes at startup and every scan, and halt on mismatch. Chain ID and deterministic contract address alone do not prove identity. Do not reuse a future projection merely because today's connectivity probe succeeds; reset both datasets explicitly when starting a different deployment.

Anvil contains public development accounts. Keep it local. The tools container has no Docker socket, cloud credentials, business signer or escrow funds. The foundation job proves its infrastructure checks; the separate contracts job verifies the approved AC1-AC5 core with 62 tests and compiled ABI checks. AC6-AC12 remain later slices.
