# Infrastructure implementation and independent review disposition

Date: 2026-11-04. The candidate explicitly authorized infrastructure + CI implementation. Issues #1-#7 already existed; no duplicate tracker was created. Codex owns runtime files/execution and Claude owns the bounded workflow edit.

## Delivered scope

Pinned Node/npm/TypeScript/pg dependencies with a lockfile, minimal Foundry/Solidity configuration and empty contract directories. Compose provides ephemeral Anvil and PostgreSQL with disposable named storage, plus a non-root tools image. Only the development override publishes loopback ports. Scripts provide start, stop, explicit joint reset, probes, isolated real-service checks and a thin reviewed-SQL entry point. There is no escrow, API, indexer, event schema or deployment.

The [English local guide](../../local-development.md) is the runnable command reference. The CI workflow is Claude's single-file contribution, with pinned official actions, push/PR checks, minimal permissions, bounded waits and always-run project cleanup. Do not interpret a green foundation job as business acceptance.

## Verification performed by Codex

- `npm ci --no-audit --no-fund` and `npm run check`: exit 0 against actual arm64 Docker services after the final runtime fixes. Strict TypeScript, chain ID 31337, exact next-block timestamp and exact mining count passed.
- Snapshot/revert restored the prior head; different next timestamps produced distinct block hashes at the same height. No indexer reorg recovery is implemented yet.
- Actual PostgreSQL insert rollback and two-client session advisory-lock contention/release passed. Database-local scope is independently supported by PostgreSQL documentation; the test itself proves same-DB session contention.
- The stopped-PostgreSQL probe exited exactly 1 with RPC_READY and DB_UNAVAILABLE; checks passed before and after restart. This proves the unavailable-service case, not every refusal/timeout mode.
- Development command checks: repeated up preserved the active head; after stop, up refused without deleting the DB volume; explicit reset removed the chain session and DB data; fresh up had block zero and no fixture table. Temporary fixture files/tables were removed. The SQL entry committed a valid file and rolled back a statement-error file; no migration history or CI migration test is claimed.
- Loopback-only bindings and no surviving test containers/network/volumes were checked. Local services were left running and healthy. `forge config --root contracts --json` parsed the pinned 0.8.30/Cancun configuration; no compiler build or empty test suite is claimed as contract evidence.
- Official image indexes were inspected for amd64 and arm64 support. Action SHAs were resolved from official repos; setup-node's pinned action metadata confirms `package-manager-cache: false` is supported. Node/npm versions were checked locally and inside the successful image build.

The remote workflow result belongs in [issue #2](https://github.com/dubzn/remitee-challenge/issues/2), linked to the actual pushed SHA/run. Closing that issue requires observing a successful run; creating YAML alone is insufficient.

## Claude findings and Codex decisions

Preserve the [exact prompt](../claude/2026-11-04-ci-prompt.md) and [unmodified response](../claude/2026-11-04-ci-output.md). Claude edited only `.github/workflows/foundation.yml`; its findings reference the revision it read, before these corrections.

1. **PostgreSQL health race accepted/fixed:** explicitly probe TCP, avoiding the image's temporary socket-only initialization server.
2. **Anvil persistence concern confirmed:** the actual image runs as foundry uid 1000, and the initial root-owned mount was not writable; no state file was produced. Our first restart result therefore did not prove what a valid state archive can preserve. Removed snapshot persistence rather than adding volume initialization/archive scope. Final Anvil is deliberately ephemeral; startup refuses stopped/partial projects and requires explicit joint reset. Manual RPC/container resets still require the future AC8 identity checks before any projection is served.
3. **SQL wording qualified:** reviewed transaction-compatible SQL only; no parser blocks transaction control/metacommands. Explicit ROLLBACK may exit successfully. This is not a versioned/isolated migration runner; issue #4 owns that policy.
4. **Diagnostics fixed:** print the original failure, tolerate log-collection failure and retain the original error if cleanup also fails. Cleanup-only failure still fails the command.
5. **Image tag accumulation deferred:** local build cache/tags are retained and documented. No global prune or extra cleanup framework was added.
6. **Claims narrowed:** stopped service and same-DB contention are exactly what the tests assert. Anvil runs silently; PostgreSQL/Compose logs and explicit probe errors remain available, but no comprehensive Anvil logging claim is made.

No business security audit, host-architecture equivalence guarantee, forced-cancellation cleanup experiment or production durability claim follows from this foundation. AC1-AC12 and the pause-policy decision remain open for later slices.
