# Final consistency review: working tree at `a900629` plus uncommitted docs

I found nothing that blocks submission. Everything below is low severity. I read files only and ran no commands or tests. The CI and Codex execution evidence you supplied is taken as given, not re-run by me.

## 1. Findings, most severe first

### Low

**L1. A current doc carries stale evidence counts and is not linked from the README.**
- `docs/sdd/typescript-readability.md:22,24` reports "28 unit tests", "12 cases" for the API suite and "10 Docker checks".
- Current figures are 18 indexer units, 16 API units and 13 Docker checks. `api-unit.test.ts` has 16 top-level cases. `compose-acceptance.ts` records 13 passes.
- The README reference list (`README.md:228`) does not link this file, and line 14 mentions a "private Spanish mirror".
- **Smallest fix:** delete the "Verification" section, or label it "as of that change". Optionally move the file under `docs/ai-log/planning/`.

**L2. `db:sql` and `db/migrations/` are dead surface.**
- `package.json:22` and `scripts/infra.ts:129-158` define a manual-SQL runner. No migration exists (`db/migrations/.gitkeep` only), and no doc mentions it.
- It also sits oddly beside "Ponder owns schema lifecycle" (`docs/postgres-models.md:3`).
- **Smallest fix:** remove the script, the `sql` case and the `db/` directory. Also drop the stray `contracts/test/.gitkeep`.

**L3. The Foundry image digest is pinned in two places with no cross-check.**
- It appears at `compose.yaml:15` (Anvil, and the image the contract checks and host builds use) and at `Dockerfile.app:1`, which builds the packaged `Escrow.json`.
- The digests match today (`v1.4.1@sha256:629bebb4…`). If one is bumped alone, the packaged `codeHash` can differ from a host-built one.
- The Node version is already asserted at `compose-acceptance.ts:146-147`; the Foundry digest is not.
- **Smallest fix:** add a "keep in sync with …" comment in both files. No new check is needed.

**L4. The `-p` versus `COMPOSE_PROJECT_NAME` image tag behavior is unconfirmed.**
- `compose.yaml:70,86,106` tag the image `${COMPOSE_PROJECT_NAME:-remitee-challenge}-app:local`. `development.md:25` calls it a "per-project image".
- `compose-acceptance.ts:44-55` selects projects with `-p` only.
- If Compose does not feed `-p` into `${COMPOSE_PROJECT_NAME}`, every `-p` project shares the tag `remitee-challenge-app:local`.
- I did not verify this. The impact is small, since the source is identical, but the "per-project" wording would be wrong.
- **Smallest fix:** check with `docker compose -p x --profile app config | grep image`, or soften the wording.

**L5. The RPC-budget wording is slightly loose.**
- `development.md:39` ("Polls use two fresh RPC calls") and `docs/sdd/escrow.md:15` ("A poll uses 2 RPCs") are true per proxied request: `rpc-unit.test.ts:103` asserts 2 calls.
- A `blockHash` log filter costs 3 (`rpc.ts:84-88`), and a busy poll issues several requests.
- **Smallest fix:** say "an idle poll" or "each proxied request".
- The API figure holds as written. A read makes 3 block requests, or 2 if the checkpoint equals the head (`read-model.ts:167-172`), which cannot happen at delay 2.

**L6. Naming and type warts, optional.**
- `Observation` is exported from both `projection.ts:40` (event) and `read-model.ts:24` (chain).
- `EscrowRecord.status` is typed `string` (`projection.ts:19`) although `Status` exists on line 3.
- Status names are listed in `projection.ts:3` and `domain.ts:5`. Only the `domain.ts` list is tested against the OpenAPI enum (`api-unit.test.ts:31`).
- `deploy-local.ts:32` and `demo.ts:75` cast `{ rpcUrl, deployment } as Settings`. This is safe today because `identity()` only reads those two fields, but nothing in the types enforces that.

**L7. Informational, no action required.**
- `foundation.yml:1-5` still says "Foundation only", though the workflow has five jobs.
- Root `package.json` declares only `pg`, but the root scripts import `viem`. This works through workspace hoisting, and CI passes.
- `server.ts:44-50` (405) and `server.ts:62-66` (`route_not_found`) are not in the OpenAPI file. That matches its stated scope of "three exact business paths".
- `checkpoint_not_eligible` is in the enum. It can occur transiently if a block lands and is indexed between head capture and the SQL snapshot (`read-model.ts:217-225`). No doc says it is retryable. The manual guide already says to repeat the GET.

### Checked and consistent

- **API fields and errors:**
  - Field names in `domain.ts:167-180`, the `Observation` fields (`read-model.ts:187-205`), the health body (`health.ts:128-140`) and the error codes (`server.ts:25,31,64`) match `openapi.yaml`.
  - The reason enum in `errors.ts` equals the OpenAPI enum (also enforced by `api-unit.test.ts:33`).
  - The 404 message string and the documented guard order match `queryObservation` and `health()`.
- **Timings:**
  - 2h and 7d, the exclusive and inclusive boundaries, and the check order (existing ID, Pending, caller, time) match `Escrow.sol:35-101` and `contracts/README.md:20`.
  - SQL (`queries.ts:20-23`) and `eligibility()` (`domain.ts:149-151`) agree on the expiry boundary. `api-acceptance.ts:330-333` exercises it.
- **Config ranges:** every range and default in the `development.md:27-37` table matches `config.ts:41,81-107`.
- **Startup and restart:**
  - The launcher's identity check, scope and replay check, and startup floor (`indexer.ts:12-39`), and the API's own identity check before listening (`read-api.ts:9-12`), match the docs.
  - Descriptor reuse (`deploy-local.ts:30-44`) sends no transaction. It sets only the next block timestamp, as `development.md:25` says.
  - Dependent-services startup order and the `--no-deps` demo match `compose.yaml` and the README.
- **Scripts:** the six scripts copied at `Dockerfile.app:17` equal the allow-list asserted at `compose-acceptance.ts:171-178`. The demo's numeric statuses 1-4 (`demo.ts:19-41`) match the `IEscrow.Status` order.
- **Manual guide:**
  - The commands and variables are consistent with `compose.yaml`, `deployment.json` and `Escrow.json`.
  - The selectors `0xde9fcd86` and `0xacb067e8` are corroborated by the Codex delivery-readiness log, not recomputed by me.
- **Contract:** I found no defect in `Escrow.sol`. State is written before the transfer, every external entry point is `nonReentrant`, and the received amount is checked exactly. The events match `abi.ts`, and `build-artifacts.ts:67` asserts that equality on each deploy and demo.

## 2. Duplication and dead code

- **Deliberate repeats, leave alone:**
  - The address and hash regexes in `config.ts:59-66`, `read-model.ts:94-100` and `domain.ts:15-17`.
  - The identity check run by both the launcher and the API.
  - The fixture asserts in `demo.ts`, which re-check the escrow trace twice (`demo.ts:341-345` and `verifyFinalEscrows`).
- **Same rule in two places, currently in sync:**
  - **Expiry boundary:** SQL and `eligibility()`, covered by acceptance tests.
  - **Foundry digest:** see L3.
  - **Foundry image lookup from `compose config`:** copied in `contracts.ts:8-21`, `contract-docs.ts:22-28` and `build-artifacts.ts:20-26`. The checks differ slightly: `build-artifacts.ts:26` only checks the digest suffix. This is harmless and does not justify a shared helper.
- **Dead code:** `db:sql` and `db/migrations` (L2). In the exports I grepped (`businessPaths`, `unavailabilityReasons`, `effectiveStatuses`, `eligibility`, `UINT256_MAX`, `apiListenHost`, `newReadTrace`, `parseConfirmationDelay`, `EffectiveStatus`), I found none unused. I did not exhaustively check every export (for example `projection.ts` `Hex` and `Status`, or the `rpc` member of `chainReader`).
- **Unused parameters:** none found in the indexer or API modules I read.

## 3. Coverage

| Area | What I read | Depth |
| --- | --- | --- |
| Contracts | `Escrow.sol`, `IEscrow.sol`, `contracts/README.md`; structure of the `contracts/test/` files (suite names and counts via grep, not test bodies) | Source in full; tests structural only |
| Indexer core | `config.ts`, `rpc.ts`, `read-model.ts`, `projection.ts`, `store.ts`, `abi.ts`, `ponder.config.ts`, `ponder.schema.ts`, `src/index.ts`, `src/api/index.ts` | Full |
| `apps/indexer/api/` | `server.ts`, `health.ts`, `queries.ts`, `domain.ts`, `errors.ts` | Full |
| Scripts | `indexer.ts`, `read-api.ts`, `deploy-local.ts`, `demo.ts`, `contracts.ts`, `contract-docs.ts`, `compose-acceptance.ts`, `deployment-manifest.ts`, `build-artifacts.ts`, `infra.ts` (full except the final lines) | Full |
| Infra and CI | `compose.yaml`, `compose.local.yaml`, `Dockerfile.app` (via grep, because the tool treated `.app` as binary), `package.json`, `apps/indexer/package.json`, `foundation.yml`, `.env.example` | Full |
| Docs | `README.md`, `docs/api/README.md`, `docs/api/openapi.yaml`, `docs/development.md`, `docs/manual-walkthrough.md`, `docs/postgres-models.md`, `docs/contract-flows.md`, `docs/sdd/escrow.md`, `docs/sdd/typescript-readability.md`, `docs/ai-log/README.md` | Full |
| Tests | Counts and targeted greps only (RPC-call assertions, `ExpiredRecoverable` boundaries, `checkpoint_not_eligible`) | Spot-checked |

**Not read:**
- Bodies of `unit.test.ts`, `rpc-unit.test.ts`, `api-unit.test.ts`, `api-acceptance.ts` and `integration.ts`.
- The contract test and mock sources.
- `scripts/api-spec.ts`, `probe.ts`, `smoke.ts` and `services.ts`.
- `Dockerfile.tools`, `.dockerignore` (matched only by grep), `biome.json` and `tsconfig.json`.
- Everything under `docs/ai-log/` apart from its index. As instructed, I skipped `.docs_es/`, `.local/` and secrets.

**Uncertainties:**
- L4 (the image tag behavior).
- The selector values, which I did not recompute.
- Whether the README's `ponder_rpc_cache_*` schema is actually created with `cacheRpcRequests: false`. The name exists in the Ponder sources, but I could not confirm creation. The sentence is accurate as "belongs to Ponder".

## 4. Verdict

You can submit as is. I recommend at most three small edits, none of which touch behavior:

1. Fix or relabel the counts in `docs/sdd/typescript-readability.md` (L1).
2. Remove `db:sql` and `db/` (L2).
3. Add a sync comment for the Foundry digest in `compose.yaml` and `Dockerfile.app` (L3).

I would add no infrastructure, refactor, test suite or feature. Fuzz and invariant work stays listed as future work, as you decided.

Claude usage remaining:
- Current session: 56% remaining · resets Nov 9 at 9:49pm (America/Buenos_Aires)
- Current week (all models): 88% remaining · resets Nov 15 at 11:59am (America/Buenos_Aires)
- Current week (Fable): 100% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
