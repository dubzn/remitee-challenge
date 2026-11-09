# Infrastructure-first implementation and ownership

Date: 2026-11-04. The candidate explicitly authorized implementation of local infrastructure and CI after the planning review. Seven issues already exist. Escrow contract implementation is not part of this block. See [commands and verification](local-development.md).

## Outcome and timebox

Establish a reproducible local Docker environment and GitHub CI before implementing business behavior. Target 2-3 hours for foundation and at most 1 hour for initial CI. Reuse the setup/migration allowance already in the delivery budget; do not add a second infrastructure project. Basic CI becomes planned baseline work rather than a late optional feature.

## Minimum useful foundation

- One Compose project with Anvil and PostgreSQL, pinned compatible images, health checks and named disposable local data. Ports bind to localhost. No cloud, Kubernetes, queue broker or hosted database.
- A pinned Node/TypeScript toolchain and dependency lockfile for probes and subsequent backend slices. The API/indexer business implementation remains a later slice.
- One documented startup command and separate stop/reset/check commands. State reuse requires a matching chain/deployment identity: PostgreSQL data can survive an Anvil reset. Reset deliberately clears both project datasets; no silent reuse based only on chain ID/address. Destructive cleanup is explicitly named and limited to this project's resources.
- Real smoke checks: RPC chain ID, exact next-block timestamp, mining a chosen number of blocks, and snapshot/revert with explicitly different timestamps producing different hashes at the same height. Verify PostgreSQL connection/rollback and one controlled unavailable-DB failure in an isolated test project. No production key, funded wallet, escrow deployment or fake business success is needed.
- A migration entry point and isolated test databases ready for the later event journal. Advisory locks can collide across schemas, so use a separate database per parallel test worker. Chain time/mining are global: integration tests use their own Anvil or run serially against an isolated test instance. Do not build speculative business schema or a general migration framework.
- Configure Foundry so later contract tests run consistently. A version check or empty suite is not evidence that escrow tests pass.

## CI after local smoke checks

Use the same install/check commands on pull requests and pushes. Start with dependency install, TypeScript checks and real Anvil/PostgreSQL smoke checks, with bounded waits and cleanup. Add contract/indexer/API tests when their slices exist; never advertise nonexistent suites as green security coverage.

Keep workflow permissions minimal, use no secrets for the local test chain, and avoid privileged pull-request execution. A green initial workflow means the foundation passed, not that AC1-AC12 are verified.

## Task split

| Block | Primary implementer | Independent reviewer / verifier | Exit condition |
| --- | --- | --- | --- |
| Local Docker/toolchains/probes | Codex | Claude reviews proposed/runtime files; Codex executes checks | Clean startup, RPC/DB smoke, safe project-scoped cleanup |
| Initial GitHub CI | Claude, bounded file-edit task after commands stabilize | Codex reviews full diff and runs/observes CI | CI invokes actual local checks and succeeds on the pushed SHA |
| Escrow contract and Foundry tests | Codex owns contract/core tests; Claude owns bounded adversarial tests after ABI freeze | Codex executes all tests; Claude reviews contract/security independently | Approved Nov 5 core/AC1-AC5; pause/upgrades deferred by candidate |
| PostgreSQL indexer and recovery tests, later | Codex | Claude reviews idempotency, concurrency and reorg handling | AC6-AC8 against real services |
| Read API and derived time/filter tests, later | Codex | Claude reviews state/time and snapshot consistency | AC9-AC10 |
| Full startup/deployment/demo and submission | Codex integrates; candidate explains | Claude final bounded review; Codex verifies | AC11-AC12 and all mandatory evidence |

AI names are work ownership, not GitHub user accounts. The candidate remains responsible for requirements and understanding. Claude runs through the subscription runner with the requested model/effort; Codex owns shell execution, tests and integration. Do not have both agents edit the same file concurrently.

Codex owns shared root configuration/lockfiles, Compose, Foundry config and runtime scripts. Claude owns the bounded CI workflow task and designated adversarial test files, not those shared files. Foundry unit tests use their in-process EVM and are not blocked on Docker once the scaffold exists. Review/edit handoffs must include actual test results from Codex.

## GitHub tracking

Seven issues were created and verified on Nov 4. Each includes roles, dependencies, acceptance criteria and scope limits. The Nov 5 core approval and deferred pause/upgrade discussion are recorded on the contract issue.

| Issue | Work block | Depends on |
| --- | --- | --- |
| [#1](https://github.com/dubzn/remitee-challenge/issues/1) | Local Docker/toolchain foundation | Reviewed planning published; implementation authorized |
| [#2](https://github.com/dubzn/remitee-challenge/issues/2) | Baseline CI | #1 |
| [#3](https://github.com/dubzn/remitee-challenge/issues/3) | Escrow and Foundry tests | #1 scaffold, #2 CI, Nov 5 approved core; pause/upgrades deferred |
| [#4](https://github.com/dubzn/remitee-challenge/issues/4) | Indexer and recovery | #1, #2, #3 event interface |
| [#5](https://github.com/dubzn/remitee-challenge/issues/5) | Read API and health | #4 schema/metadata and #3 lifecycle |
| [#6](https://github.com/dubzn/remitee-challenge/issues/6) | Full startup and demo | #3-#5 |
| [#7](https://github.com/dubzn/remitee-challenge/issues/7) | Acceptance and rehearsal | #6 and mandatory #2-#5 evidence |

Documentation and issue bodies remain English. Local credentials and temporary artifacts stay outside version control.

## Current evidence

- Repository: `dubzn/remitee-challenge`, default branch `master`; connected account has push access. No existing issues were returned at intake.
- Docker Desktop was started for implementation. Pinned multi-architecture images, tools, Compose and actual isolated positive/negative checks passed locally. Anvil is ephemeral and PostgreSQL uses one named volume; stopped/partial development projects require explicit joint reset before a fresh session.
- Foundry 1.4.1, Solidity config 0.8.30/Cancun, Node 24.14.1/npm 11.11.0 and PostgreSQL 17.11 are fixed. Local startup, repeated-up reuse, stopped-project refusal, SQL commit/error rollback, reset and clean startup were checked.
- Claude created the bounded CI workflow; Codex reviewed it and corrected runtime findings. [Run 41829734342](https://github.com/dubzn/remitee-challenge/actions/runs/41829734342) succeeded on implementation commit 68e1e7a, including cleanup. Issues #1 and #2 were closed with evidence. See [implementation and review evidence](outputs/codex/2026-11-04-infrastructure.md). The subsequent approved contract slice is now implemented: 62 tests, both jobs successful in [run 41962697117](https://github.com/dubzn/remitee-challenge/actions/runs/41962697117), and #3 closed. See [contract evidence](outputs/codex/2026-11-05-contract-implementation.md). #4-#7 remain open; deployment/indexer/API remain later slices.
- GitHub connector issue creation returned 403 (integration access); the CLI had no login. The existing authenticated browser session successfully created issues #1-#7; the final list showed all seven open.
