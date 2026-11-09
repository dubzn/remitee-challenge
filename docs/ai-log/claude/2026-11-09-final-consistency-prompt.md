# Final code and documentation consistency review

Review the current working tree read-only before submission. Respond in English. Do not edit files, run agents or treat earlier reviews as proof of the current code. The candidate requests a final practical check for harmful duplication, dead code, contradictory documentation, stale runtime instructions and substantial defects. No new product scope is requested.

Actually inspect these current runtime sources, including the indexer files omitted from the previous delivery review:

- `contracts/src/Escrow.sol`, `contracts/src/IEscrow.sol`, and the test-suite structure in `contracts/test/`.
- `apps/indexer/config.ts`, `rpc.ts`, `read-model.ts`, `projection.ts`, `store.ts`, `ponder.config.ts`, `ponder.schema.ts`, `src/index.ts`, `src/api/index.ts`, and every module in `apps/indexer/api/`.
- `scripts/indexer.ts`, `read-api.ts`, `deploy-local.ts`, `demo.ts`, `contracts.ts`, `contract-docs.ts` and `compose-acceptance.ts`; consult the acceptance tests when needed to substantiate behavior.
- `compose.yaml`, `Dockerfile.app`, `package.json`, `.github/workflows/foundation.yml`.
- Current docs: `README.md`, `contracts/README.md`, `docs/api/README.md`, `docs/api/openapi.yaml`, `docs/development.md`, `docs/manual-walkthrough.md`, `docs/postgres-models.md`, `docs/contract-flows.md`, and `docs/sdd/*.md`.

Historical records under `docs/ai-log/` intentionally retain earlier designs, rejected advice and old paths/counts. Their index explains that they are history, not current runtime instructions. Do not flag their historical content as a present contradiction. Ignore `.docs_es/`, `.local/`, generated artifacts, dependencies and private files. Do not inspect wallet/configuration secrets.

Settled constraints:

- Fixed RPC endpoint/deployment while processes run. Identity checked only at startup; fresh runtime checkpoint/head hash checks stay. No hot deployment replacement machinery or response cache.
- One Escrow contract, constants 2h/7d, immediate beneficiary decisions, exact-transfer ERC-20 assumption; no pause, upgrades, auth, browser wallet or public testnet requirement.
- Fuzz/invariant work remains future work: the user explicitly cancelled a proposed solvency invariant before any implementation. Do not request it as a submission condition.
- Small repeated address/hash checks in independent validation boundaries or test fixtures do not justify a generic abstraction. Focus on inconsistencies and maintenance risk, not maximum DRY.
- The latest published runtime is `a900629`. CI run 42706226302 passed all five jobs: Biome, foundation/typecheck, contracts/reference docs, indexer/HTTP acceptance, full Docker lifecycle. Codex independently executed 18 indexer units, 16 API units, 19 actual integration observations and 13 Docker checks before this documentation-only closeout. These are supplied execution evidence, not your own test runs.
- Manual guide commands were exercised with signed mnemonic indexes 0/1 in isolated projects: delay 2, delay 0, repeated IDs/nonzero balances and after the full time-advancing demo. The candidate then ran the local flow personally. Codex viewed the three Zed terminal panes and verified escrow 5 is Released, sender lost 1 TEST, beneficiary gained 1 TEST, escrow returned to zero, the resolution hash matches its receipt, terminal cancellation reverted, health is ready and eligibleBacklog is 0. Do not rerun or reset the user's stack.

Deliver:

1. Concrete findings sorted by severity, with current file/line evidence and the smallest useful correction. State whether any blocks submission. Check current docs against the actual field names, error behavior, schema/index scope, timings, RPC budget, startup/restart and scripts they describe.
2. Any harmful code duplication/dead exports/unused parameters. Distinguish deliberate repeated validation from duplicate business rules that can drift.
3. A concise coverage table of what you actually read. Explicitly identify any omitted component or uncertainty; do not call the review exhaustive if you skipped the indexer core.
4. A bounded final verdict. Suggest no new infrastructure, broad refactor, test suite or optional feature merely to improve completeness.
