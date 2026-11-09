# Documentation tooling review: OpenAPI and NatSpec

## Verdict
Keep both issues. Make two changes: (a) for now, Swagger UI should be an optional view over the spec file, and the spec file is the real deliverable; (b) Issue 1 depends on S3 deciding where the API is hosted. Native Ponder reserves `/health`, and the spec requires a public `GET /health`. The spec's paths and server URL can't be fixed until S3 settles that.

## Issue 1: OpenAPI 3.1 and Swagger UI (depends on S3 #5)

**Spec-first or code-first.** I recommend spec-first: one versioned `openapi.yaml` file.
- **Fact:** the current API is plain `Hono` (`apps/indexer/src/api/index.ts:7`). No Zod, OpenAPI or validation library appears in any `package.json`.
- **Code-first** (`@hono/zod-openapi`) adds Zod, swaps in `OpenAPIHono` and puts the schema next to the handler. It only pays off if S3 already plans to validate queries with Zod. **Assumption:** it works under Ponder 0.18.5 and Hono 4.13.16. This is unverified.
- **Spec-first's risk is drift.** Response checks address that; see below.

**Swagger UI.** **Fact:** the UI is static assets. **Assumption, likely:** `@hono/swagger-ui` loads them from a CDN by default. If so, a reviewer who is offline sees a blank page. Self-hosting means pinning `swagger-ui-dist` (a new dependency). If that cost looks wrong in S4/S5, drop the UI and keep the spec file. The raw spec stays readable in the repo either way.

**Docs during an RPC/DB outage.** `/openapi.json` and `/docs` must:
- read only static content;
- sit outside any readiness gate;
- return 200 while `/health` returns 503.

If Ponder hosts the API and its process exits on RPC failure, the docs go down with it. The committed file is the fallback.

**Missing high-value checks:**
1. Offline structural validation against the OAS 3.1 meta-schema. Ajv with a vendored schema is enough; a lint CLI may send telemetry, which needs checking.
2. Route parity: every registered route appears in the spec, and every spec path is registered.
3. Responses that existing S3 HTTP tests already produce are validated against component schemas with `additionalProperties: false`. Cover detail 200, list empty and with a cursor, 400, 404, and health 200/503.
4. The spec's `examples` validate against the schemas and are reused as the README HTTP examples (AC12), so they come from one source.
5. Patterns: decimal string `^(0|[1-9][0-9]{0,77})$` (it can't express the exact 2²⁵⁶−1 limit; say so), an address pattern that matches the actual casing, and an effective-status enum that includes `ExpiredRecoverable`.
6. Docs routes respond with the DB stopped and the RPC unreachable. The served HTML contains no external `https://` hosts.
7. GET only, no security schemes, and a statement that the API never signs.

One file plus response checks fits three endpoints. Redoc, SDK generation and portals are out.

**Non-goals:** new endpoints or fields, client generation, hosted docs.

**Effort (rough guess, not measured):** about 0.5 day after S3's response shapes settle, plus about 1–2 h if the UI is self-hosted.

## Issue 2: NatSpec and `forge doc` (independent; schedule before the S4 clean run)

**Facts from the source:**
- `IEscrow.sol` has no NatSpec at all.
- `Escrow.sol:10-11` has only contract-level `@notice` and `@dev`.

**NatSpec in source.** Put the prose on `IEscrow`: functions, events, errors, enum and constants. In `Escrow`, use `/// @inheritdoc IEscrow` or nothing. **Fact:** solc inherits docs automatically for undocumented implementations when parameter names match. Write the timing rules exactly as the code enforces them:
- cancel: `block.timestamp < cancelDeadline`
- confirm or reject: `< expiresAt`
- recover: `>= expiresAt`

**Uncertain:** solc may reject `@param` on struct fields. Describe fields in a struct-level `@dev` if `forge build` complains.

**Three separate layers:**
- **Source:** solc validates the tags, and an invalid `@param` name fails compilation.
- **`forge doc`:** generates markdown into `--out`. That directory needs adding to `.gitignore`, which currently ignores only `contracts/out/`, `cache/` and `broadcast/`.
- **Rendered HTML:** `--build`/`--serve`. **Assumption:** mdbook is embedded in forge, but treat it as unproven until it runs in the pinned image. Inside the container, `--serve` needs `--hostname 0.0.0.0` and a port that doesn't clash with other services. Check the rendered HTML for external requests (fonts, MathJax). Hosting is out of scope.

**ABI and bytecode.** The ABI doesn't change. The bytecode does: by default solc appends a CBOR metadata hash that covers the source, and `foundry.toml` doesn't set `bytecode_hash = "none"`. So the deployed bytecode's metadata tail changes.
- **Repo evidence:** `codeHash` is recomputed from fresh artifacts (`scripts/deploy-local.ts:43`, `scripts/deployment-manifest.ts:52`, `apps/indexer/test/integration.ts:174`). It stays consistent with itself.
- Any kept `.local` manifest or Ponder DB from before the change will fail the codehash check, so a clean rerun is needed.
- Deployment gas may shift slightly.

**Checks:**
1. `forge inspect Escrow abi` is identical before and after (this reuses the C10 check).
2. `forge inspect` devdoc/userdoc lists all 5 actions, 5 events and 10 errors.
3. All 62 tests and the format check pass.
4. Generation is reproducible into the ignored directory.
5. The indexer acceptance run passes from clean state.

**Non-goals:** behavior changes, audit claims, NatSpec on OpenZeppelin, committed HTML.

**Effort (rough guess):** about 2–3 h.

## Requirement classification
The employer's literal requirements are AC9–AC12: tests, runnable instructions, HTTP examples, and design assumptions. Swagger UI, `forge doc` HTML and NatSpec completeness are reviewer documentation that you've now made mandatory, not employer requirements. If the schedule gets tight, cut in this order: Swagger UI, then `forge doc` HTML, then the response checks. The spec file and the NatSpec source stay.

This was a read-only review: I edited nothing and ran nothing, so no command or test was executed. Plan mode asked for a plan file and an approval request; I skipped both because you said not to edit or request approval.

Claude usage remaining:
- Current session: 96% remaining · resets Nov 6 at 6:40pm (America/Buenos_Aires)
- Current week (all models): 93% remaining · resets Nov 8 at 12pm (America/Buenos_Aires)
