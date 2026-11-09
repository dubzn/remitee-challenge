# Documentation tooling decisions and tracking

Date: November 6, 2026. The candidate requested issues for API OpenAPI/Swagger UI and contract NatSpec/forge doc, plus an independent Claude xhigh tooling review. This task created planning/tracking and ran an isolated generator smoke. It did not implement the public API, write its OpenAPI artifact, add Swagger UI or edit contract NatSpec.

## Subsequent candidate clarification

After this review, the candidate accepted prioritizing OpenAPI and consistency checks, with Swagger UI as optional final polish. This supersedes the UI-mandatory disposition below, retained as review history. Issue #11 appends the clarification without deleting its original proposal; the current [SDD](../../sdd/escrow.md) and [progress](../../progress.md) reflect it. The earlier estimate included UI and is not a revised mandatory budget. The [read API guide](../../read-api-design.md) also records future-only caching/AuthN/AuthZ (#13/#14), with no implementation or new delivery gate.

## Original decision and issues

| Area | Selected approach | Tracking |
| --- | --- | --- |
| API | One spec-first OpenAPI 3.1.0 definition, served by the public API and rendered by a pinned self-hosted Swagger UI 5.x distribution. Reuse S3 HTTP tests for schema/example checks. | [#11: OpenAPI and Swagger UI](https://github.com/dubzn/remitee-challenge/issues/11) |
| Contracts | NatSpec on the canonical IEscrow public surface, verified inheritance in Escrow, and Markdown/HTML generated with the existing pinned Foundry 1.4.1 forge doc. | [#12: NatSpec and forge doc](https://github.com/dubzn/remitee-challenge/issues/12) |

These are candidate-requested documentation deliverables linked to S3/S5, not literal employer instructions or a reopened contract/indexer milestone. Swagger UI remains requested acceptance; it is not silently downgraded to optional work. Both issues are open and include dependencies, scope limits and checks. No public docs hosting or new application stack is added.

## Independent review and disposition

The [bounded prompt](../claude/2026-11-06-documentation-tooling-prompt.md) and [unmodified Opus/xhigh response](../claude/2026-11-06-documentation-tooling-review.md) are retained separately. The subscription-only runner completed with exit 0 and no stderr. Claude edited nothing and executed no tests. Codex checked its advice against current source, primary references and actual pinned tools.

| Reviewer advice | Disposition |
| --- | --- |
| Prefer one spec-first file for three endpoints; code-first only pays off with shared runtime validation. | Adopt. Hono/Zod OpenAPI is a real option, but S3 has not chosen shared Zod schemas. Do not maintain two specifications or change frameworks just for docs. |
| Treat Swagger UI as optional or cut it first. | Not adopted: the candidate explicitly requested it. Track a bounded UI implementation; discuss any future scope cut rather than applying one silently. |
| API documentation depends entirely on finishing S3 hosting. | Refine: public GET paths are already agreed. Draft the API contract before S3 handlers; wire its server/base URL, health route and response checks with #5. No circular dependency. |
| Response checks, examples and offline docs are valuable. | Adopt for public business routes. Exclude Ponder diagnostics and static documentation resources from business-route parity. Reuse actual S3 tests; schema validation does not replace behavior tests. |
| A paginated list should be checked with a cursor. | Correct to the current limit/offset contract. Cursor pagination is not planned. |
| A 78-digit string pattern validates uint256. | A pattern only constrains syntax/length. Use positive escrow IDs, decimal-string amounts and exact BigInt bounds at runtime; include large/max examples and explicit timestamp serialization. |
| Generated HTML must contain no external https hosts. | Refine to no externally fetched runtime resources. Reference hyperlinks are fine; scripts, CSS, fonts, MathJax and the Swagger validator must work without external requests. |
| mdbook may be embedded, but this is untested. | Now independently verified in the pinned image: forge doc --build succeeded with no separate mdbook executable on PATH. No new Rust/mdbook installation is justified. |
| Old manifests/data necessarily fail after a NatSpec source change. | Correct: a new build can have a different metadata/code hash, but the existing deployment and matching descriptor remain valid together. scripts/deploy-local.ts reuses an existing validated descriptor before compiling new artifacts. Fresh deployment/replay is needed when choosing the new build, not an automatic wipe. |

Solidity's compiler documents supported NatSpec tags and inheritance, and its default metadata fingerprint includes source hashes. Documentation changes must preserve the ABI/behavior while allowing metadata differences. Do not disable metadata or weaken identity checks. [NatSpec 0.8.30](https://docs.soliditylang.org/en/v0.8.30/natspec-format.html), [metadata](https://docs.soliditylang.org/en/v0.8.30/metadata.html).

## Tool verification and concrete limits

The current workspace has Hono 4.13.16 in the Ponder indexer, but only internal observation endpoints. The public API and its hosting are still S3. OpenAPI 3.1.0 is a deliberate compatibility target, not a claim to be the newest standard. Swagger UI 5.x supports it and swagger-ui-dist supplies server-served static assets. The UI package/version and OpenAPI validator must be pinned and exercised at implementation. [OAS 3.1](https://spec.openapis.org/oas/v3.1.0), [Swagger distribution/compatibility](https://github.com/swagger-api/swagger-ui/blob/main/README.md).

The UI should read the same served spec, target the correct same-origin API base, and remain accessible with valid API configuration while RPC/DB are unavailable. Native Ponder /health cannot be presented as the public health contract. Disable the optional online validator as well as CDN assets. The checked-in spec remains available if the entire API process is stopped. [Swagger UI configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/).

A disposable container copied contracts/src, libraries and configuration from a read-only source mount. With the exact Foundry image already pinned in compose.yaml, both commands returned exit 0:

```sh
forge doc --root /tmp/work --out /tmp/generated-docs
forge doc --root /tmp/work --out /tmp/generated-docs --build
```

Evidence stays under ignored .local/docs-tooling-99535. Six HTML files were generated, including IEscrow and Escrow reference pages. The interface Markdown contains the five events, custom errors, functions, enum/struct and constants; the implementation page does not duplicate inherited events/errors. Source documentation is still sparse: successful generation is not NatSpec completeness or rendered inheritance proof. [Pinned command reference](https://www.getfoundry.sh/reference/forge/doc).

Static resource inspection found one external MathJax script in the generated index page. The contract documentation issue requires disabling that unnecessary dependency and checking local navigation/resources. No browser visual review or actual Swagger integration was performed. The isolated container was removed; application/services, package files and contract sources are unchanged.

## Sequencing and effort

Draft #11's API contract alongside S3, then serve/test UI and actual responses with #5. Implement #12 before the S4 clean run so fresh artifacts/descriptors and indexer acceptance include the NatSpec metadata change. Finish both before #7 final acceptance/rehearsal.

Use a provisional 4-6 incremental hours for API spec/UI/checks and 2-3 for contract NatSpec/generation/checks: 6-9 hours of newly requested work, assuming reused S3 tests and the existing toolchain. Claude's estimates are opinions, not measured throughput. Reconcile overlap with the existing documentation budget when scheduling; do not automatically add the full amount twice. No extra candidate availability or change to the one-week cap/Monday target is assumed. If the bundle cannot fit, identify the specific risk and revise scope/timing with the candidate rather than dropping requested UI or extending the date silently.

No alternative contract generator is selected because the pinned forge doc works for this scope. Reconsider only for a concrete missing requirement, such as verified inheritance/rendering that cannot be met. Redoc/Scalar, SDK generation, hosted portals and a separate documentation platform are outside these issues.
