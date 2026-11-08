# S3 and contract documentation closeout

Date: November 8, 2026. The candidate authorized closing S3/API documentation and implementing the contract reference, with Claude review before commits. This slice adds NatSpec and reproducible reference generation, reconciles published S3 evidence, and retests the new contract build. It does not implement S4 startup/demo or claim S5 rehearsal is complete.

## Scope and acceptance

The canonical [SDD D1/D2 checks](../../sdd/escrow.md#requested-documentation-november-6) govern acceptance. Public contract signatures, storage, lifecycle rules, authority and token policy stay the same. The interface owns NatSpec; the implementation uses explicit inheritance. A pinned Foundry wrapper builds Markdown/HTML and checks compiler inheritance and local links/resources. Generated files remain ignored. The contract CI job runs the wrapper without npm dependencies, Anvil or PostgreSQL.

S3 implementation `9ee0c36` and its evidence commit `80f1367` are already on origin/master. Read-only GitHub inspection confirmed [Foundation run 42340576160](https://github.com/dubzn/remitee-challenge/actions/runs/42340576160), push event, head 80f13671b59f70131a612116b9bc5c5d46c4788a, completed/success. The contract, foundation and actual indexer/public HTTP jobs all passed. That run closes the previously pending S3 publication/CI evidence; it does not cover this slice's new documentation step.

## How this was tested

Execution used Node 24.14.1/npm 11.11.0 and the digest-pinned Foundry 1.4.1 image from compose.yaml. The shell did not initially expose Node; selecting the existing pinned local installation fixed the tool path without changing project dependencies.

| Command or observation | Result and what it establishes |
| --- | --- |
| Baseline compile before editing NatSpec, using compileArtifacts | Saved the original Escrow artifact under ignored .local/docs-closeout-2026-11-08/baseline for an actual before/after comparison. |
| npm run contracts:check | Passed format/build, 62 tests across 3 suites and mutating/event ABI guards. |
| npm run contracts:docs | Passed 8 inherited method notices, 6 explicit-method devdocs, parameter counts, 5 event/10 interface error userdoc/devdoc inheritances, rendered constant declarations/method details/interface link, and 98 local targets across 5 HTML pages. The constant-getter devdoc exception is explicit below. |
| Repeat npm run contracts:docs after review | Final wrapper SHA-256 0eca335f4e3a9aa15ce16118de32112876573f242461c5193a51cf2fa1238128; logs docs-reviewed-first.log/docs-reviewed-second.log. All 58 generated files, including compiler docs, Markdown, HTML and assets, had identical SHA-256 hashes across those two runs. Earlier pre-review comparisons are historical, not the evidence for this final version. This is reproducibility in the pinned environment, not cross-version output identity. |
| forge doc --build without --out | Passed inside a separate disposable pinned Foundry container from the copied contracts directory; the configured ../.local/contracts-docs output contained both rendered contract pages. This checks the documented native-equivalent command/configuration; a separate host-native installation was not tested. |
| npm run typecheck; npm run indexer:typecheck | Passed root and application strict types/code generation. |
| npm run indexer:unit | Passed all 16 projection/configuration tests. |
| npm run api:spec | Valid OpenAPI 3.1, three business GET paths, 14 response-example uses and six invalid fixtures rejected. |
| npm run api:unit | Passed all 7 HTTP/domain/spec tests. |
| npm run indexer:test | Passed all 18 integrated observations against a fresh isolated Anvil/PostgreSQL/Ponder deployment of the newly compiled contract, including real public HTTP responses. |
| Browser preview served on loopback | Opened the home and Escrow reference pages; inspected layout and inherited descriptions, then followed the implementation's IEscrow link and verified record/event/error content. No docs hosting or public port was added. |
| git diff --check; ignored-path inspection | Passed whitespace check; generated reference artifacts are ignored. |

The integration project was remitee-indexer-check-69159-f1e4147b. It exercised public detail/list/health and schemas, filters/pagination, all outcomes, exact chain-time boundaries without synthetic events, expected delay, restart/crash atomicity, RPC outages, within-window rollback and beyond-window refusal/replay, plus deployment/scope refusal. Its final report passed and owned containers/network/volume were removed. Logs/report remain ignored under .local; no existing developer deployment/database was reset.

The one-off compatibility check compared baseline and fresh-test artifacts: ABI identical; runtime bytes identical after removing the compiler's trailing CBOR metadata using its encoded length; both Solidity sources identical after removing comments and whitespace. Full deployed bytecode changed, as expected:

- Before NatSpec code hash: 0xf2afb94ffd225679881d231814733015c3ad3d316f7e7e20ee21907ab8cd8806.
- Documented build code hash: 0x7fb6e458da8d2c319c546c0b9a7f72e0b822f241ccd7664fc0b4f74260e37bca.

The hashes are keccak256 of deployed runtime bytes for the pinned compilation. This comparison and the existing behavior suite support unchanged executable behavior; they are not a formal proof for arbitrary malicious tokens. Compiler metadata identity checks remain enabled.

## Findings discovered during verification

1. The initial wrapper failed on constant getter devdoc inheritance. Solidity 0.8.30 inherits their notices, but omits interface @return metadata from implementation devdoc. The check now explicitly verifies inherited notices, interface return descriptions and rendered constant declarations, while enforcing full devdoc equality for the six explicit functions. The public interface retains the return descriptions; no signature or runtime workaround was introduced.
2. The next run caught a broken inherited-interface target in the generator's optional print.html. Main reference links work. The book configuration disables that optional print view instead of post-processing generated output or weakening link checks. Markdown/HTML reference remains available.
3. The generator's default MathJax runtime dependency is unnecessary for this reference. A checked-in book setting disables it. HTML runtime URLs and local targets are checked, and CSS is rejected if it fetches external resources. Ordinary reference hyperlinks may point outside the site. This is a bounded static check plus browser inspection, not an exhaustive network sandbox test of all JavaScript.

## Assumptions and decisions open to challenge

| Topic | Basis and selected decision | Trade-off / what would change it |
| --- | --- | --- |
| Contract interface is the documentation source | Existing IEscrow is canonical; use @inheritdoc and inspect both compiler and rendered output. | The generator does not duplicate inherited events/errors on the Escrow page; readers follow IEscrow. A separate generator is unjustified unless that reference becomes insufficient. |
| Getter compiler limitation | Observed with the pinned compiler, not assumed. Keep return descriptions on IEscrow and displayed values on Escrow. | Replacing constants with handwritten getters would change code for a documentation problem; not selected. |
| Optional print view | Newly selected packaging decision after a concrete broken link. | Printable output was not requested. If required later, investigate/fix the upstream link renderer or choose a generator deliberately. |
| Offline reading | Build a locally served reference with local runtime assets, disable unneeded MathJax. | A first generation can still need the pinned image/compiler download. Root-relative inheritance links require serving at the HTTP root: file://, nested URL prefixes and raw Markdown links do not navigate correctly. Python is only a suggested host viewer, not a pinned generation dependency. |
| Metadata and existing deployments | A new documented build has a new code hash; use a fresh deployment/schema for this verification. | An old matching deployment/descriptor remains valid. No automatic reset, descriptor rewrite or weakened identity comparison is permitted. |
| Time and payout semantics | Previously approved first-successful-resolution policy: beneficiary may settle during cancellation; expiry requires a sender transaction. | The two-hour period is a cancellation limit while Pending, not an exclusive sender right. API eligibility can lag or lose a race. |
| Supported tokens and recovery | Previously approved simple balance-preserving token model; document unsupported semantics and issuer restrictions explicitly. | Exact inbound receipt is not an asset-safety proof. Blacklisting/pausing can lock a Pending escrow; no guaranteed recovery or administrator bypass is claimed. |
| S3 OpenAPI and access | Existing single OpenAPI source and actual-response checks; Swagger UI optional, anonymous loopback local API; cache/AuthN/AuthZ remain #13/#14. | Employer acceptance of internal-process consumers is not an instruction to expose an unauthenticated production service. No new access policy is invented here. |
| Completion boundary | S3 has published CI; D2 has new local checks and an added CI step. | Current changes need a future published run to claim remote D2 success. A passing isolated integration suite does not complete S4 one-command startup/demo or S5 candidate rehearsal. |

Primary references: [Solidity 0.8.30 NatSpec](https://docs.soliditylang.org/en/v0.8.30/natspec-format.html), [compiler metadata](https://docs.soliditylang.org/en/v0.8.30/metadata.html), [forge doc](https://getfoundry.sh/forge/reference/doc/), and the pinned [documentation builder](https://github.com/foundry-rs/foundry/blob/v1.4.1/crates/doc/src/builder.rs). Local pinned tool execution takes precedence over assumptions about newer releases.

## Independent review and commit boundary

The subscription-only Opus/xhigh read-only consult completed with exit 0 and no stderr. Verdict: READY_WITH_FIXES. [Exact prompt](../claude/2026-11-08-documentation-closeout-prompt.md) and [unmodified response](../claude/2026-11-08-documentation-closeout-review.md) are retained. Response SHA-256: 022af0b36e8d9a4cb34af0015ad5b9424de4f4ddb2f78f3f8ece38c5c72f3a3a. Claude read the working tree, correctly noting that the initial ignored review.diff snapshot no longer matched later check additions. It executed no tests or remote CI queries; execution/CI observations remain Codex's evidence.

| Finding | Disposition and verification |
| --- | --- |
| R1, required: identify which wrapper version produced evidence | Adopted. Record the final wrapper SHA and repeat generation twice after every wrapper/landing-page correction. The final logs and 58-file comparison above supersede the earlier script-version ambiguity. Parameter/devdoc/render checks are now described explicitly. |
| R2, required: reconcile pending check/status wording | Adopted. D2/D2a-D2d are complete on recorded local evidence and review; progress/SDD reflect that. New documentation CI remains unobserved remotely; S4/S5 remain open. |
| O1: payout rollback wording | Clarified in the contract guide: reverting/false-returning transfers roll back; an untruthful success is not detected by an outbound balance check. NatSpec already has the supported-token constraint and arbitrary-token caveat; no comment/codehash change was needed. |
| O2: root-relative inherited link | Adopted. State root serving as a requirement, not merely an untested prefix. Ordinary HTML links work under the documented local command; file/raw-Markdown navigation is limited. |
| O3: rendered details and presence of interface link | Adopted. Assert method devdoc details in both rendered Markdown pages and the implementation's actual inherited-interface link. Final generator runs pass. Existing HTML target checks then validate its destination. |
| O4: default native-equivalent command lacked evidence | Adopted. The separate pinned-container command omitted --out, used the checked-in configuration and verified both HTML pages at its configured output. |
| O5: stale future-tense raw-spec text and port spacing | Corrected in the API guide/root README. API source/spec behavior did not change. |
| O6: error precedence | Documented existing ID -> Pending -> caller -> time order and inherited implementation errors in the contract guide. No new error-policy requirement or runtime change. |

Codex independently checked these findings against source and generated artifacts, reran the final documentation checks and root types, and reviewed the final diff. No second Claude approval after the corrections is claimed. Contract/API runtime did not change after the already-passing 62-test/18-observation runs, so those suites were not repeated merely for guide/wrapper edits.

Two reviewer classifications need care: reusing an already validated deployment/descriptor is pre-existing S2 behavior, not a new November 8 decision; keeping IEscrow canonical was already planned on November 6. The suggested NatSpec freeze is not a new binding process rule: comments remain changeable with updated metadata/compatibility/integration evidence. This slice retains the already-tested source because the clarification belongs in its guide, not to avoid a necessary correction.

Prepare two focused English commits: contract NatSpec/generation/CI, then S3 progress/review/evidence. No push or GitHub issue mutation is included in this slice.

Claude usage remaining, as reported by the runner:

- Current session: 88% remaining; resets November 8 at 11pm (America/Buenos_Aires).
- Current week, all models: 99% remaining; resets November 15 at 12pm (America/Buenos_Aires).
