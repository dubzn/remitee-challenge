# S4 complete Docker startup and demo

Date: November 9, 2026. The candidate authorized implementing S4 and evaluating Node inside Docker, preferring the entire local setup ready through Docker. The selected path removes host Node/npm/Foundry from reviewer startup and demo prerequisites. Canonical acceptance is [S4 L1-L5/AC11](../../sdd/escrow.md#s4-docker-startup-and-demo-checks-november-9); operator commands are in the [Docker guide](../../docker-demo.md).

## Selected implementation and scope

- One digest-pinned Foundry build stage compiles the current Escrow/MockERC20 artifacts. A pinned Node dependency stage runs locked production npm installation. The non-root final image includes the application, canonical OpenAPI and artifacts; compiler/libraries are absent from the runtime.
- One image, tagged per Compose project, is used for deploy/application/demo. Only deploy declares the build: parallel exporters for one image tag caused a real BuildKit collision during verification. Application and demo use the built local image without pulling a registry copy.
- Compose's app profile starts health-checked Anvil/PostgreSQL, a successful one-off deployment, then the existing shared Ponder/API launcher. Public application health controls --wait. Only the API is published on 127.0.0.1; its container listener uses validated API_HOST=0.0.0.0. Host development keeps its existing loopback default. Ponder stays on the application's internal loopback.
- The deploy CLI has an explicit --compose mode restricted to http://anvil:8545 and chain 31337, using packaged artifacts. Host mode retains loopback restriction and compilation in the pinned Foundry container. Both use unlocked development accounts, no stored private key. Admission delay parsing is shared with application settings and controls setup mining.
- The deploy job validates an existing descriptor against the chain and packaged Escrow codehash before reuse, without new transactions. Application/demo mount its volume read-only. No Docker socket, host source or .env file is mounted/copied into the runtime.
- The demo explicitly mints/approves local test tokens, creates four receipt-derived IDs, performs cancel/confirm/reject, shows Pending/ExpiredRecoverable before recovery, recovers, mines configured admission depth, and verifies API hashes/statuses and token balance deltas. It prints its actual JSON evidence and can be rerun sequentially with new IDs.

No Solidity logic or NatSpec, production credentials/signing, wallet UI, API routes/schemas, writer adapter, pause/upgrades or automatic data repair were added. The existing host workflow remains usable. The separate demo is an explicit write-capable development tool; it is not an API transaction observer or backend signer.

## Observed verification before independent review

| Check | Result and limits |
| --- | --- |
| docker compose --profile app config --quiet; actual build | Passed profile/dependency configuration and the multi-stage build. Runtime dependencies install with --omit=dev, including Ponder's required runtime tools. |
| npm run app:test, default delay 2 | Passed all 9 actual Docker acceptance observations, project remitee-app-check-88797-524add1b. No host npm packages are imported by the test driver; all application/deploy/demo execution occurs in containers. |
| Two demos in that project | Passed all four outcomes twice using IDs 1-4 then 5-8, explicit recoverable expiry, 40 raw units funded each run, sender +30/beneficiary +10/escrow unchanged, and actual creation/resolution hashes. Report retains both pre-recovery and final observations. |
| Repeat startup / application restart | Passed descriptor equality, unchanged sender nonce and unchanged original terminal API payloads. The temporary host API port was rediscovered after restart. |
| Database outage | Real 503 for health/data while raw OpenAPI remained available; DB restart restored readiness. |
| Packaged build / persisted policy / lost chain | Each incompatible case refused reuse. Build mismatch sent no transaction; policy mismatch did not disrupt the active application; restarting disposable Anvil preserved eight existing database rows and refused the old descriptor. |
| npm run check | Passed strict root types, real isolated foundation/mining/rollback probes, stopped-DB negative probe and project cleanup. Foundation project remitee-check-88330-994d6315. |
| npm run indexer:typecheck; npm run indexer:unit | Passed application codegen/types and 16 tests, with new API listen-host validation/default/scope-independence assertions. |
| npm run api:spec; npm run api:unit | Passed canonical OpenAPI, 14 response-example uses/six invalid fixtures, and all 7 API tests. |
| npm run indexer:test | Passed all 18 existing actual Anvil/PostgreSQL/Ponder/public HTTP observations on the host development path; project remitee-indexer-check-86852-d1de39f6. |

Owned default-delay, foundation and prior application test resources were removed. Build images/cache remain local by design. Detailed logs/reports stay ignored in .local/docker-startup-2026-11-09 and the printed project directories. These are local observations on the current Docker host, not remote Linux/amd64 CI evidence or a fresh machine with no cached base layers.

Additional full Docker runs also passed all 9 checks each: CONFIRMATION_DELAY=0 in remitee-app-check-90160-2cc8e378, and CONFIRMATION_DELAY=6 in remitee-app-check-90280-fe9d8c44. Both exited 0 and removed their owned resources. A separate CI job is configured to run the dependency-free driver at default delay 2 without host npm ci and clean only its selected project. Its remote execution is not yet observed.

These initial nine-check runs predate the review corrections below. The final ten-check runs are the authoritative acceptance evidence for the corrected image/demo/driver.

## Issues found while testing

1. Separate default image tags let Compose auto-build the first demo and prefix its JSON stdout with build progress. The demo itself completed, but the test correctly could not parse that combined output as JSON. Switched the three roles to one per-project image.
2. Declaring the same image build on both deploy and application caused concurrent BuildKit exporters to fail with image already exists. Keep the build declaration on deploy only; the exact one-command startup then passed from a new project/image tag.
3. The restart test initially waited on its old ephemeral host port. Docker reassigned the published port after restart, while the application itself was healthy. The driver now re-reads Compose's published port after startup/restart. Fixed-port operator instructions are unaffected.

The final default-delay full run after these corrections passed all nine checks, not merely the previously successful subset. None of the failed attempts is labeled a successful full acceptance run.

## Assumptions and decisions to challenge

| Decision | Basis / trade-off |
| --- | --- |
| Entire reviewer path in Docker | Candidate preference, not an invented employer requirement. Removes host Node/npm/Foundry setup, adds a build stage, runtime image and deployment job. Git/Docker and initialized pinned submodules remain prerequisites. |
| One application container for Ponder/API | Reuses existing shared launcher/floor/policy and internal readiness rather than splitting it into separately coordinated services. Node is a runtime image choice, not a new application architecture. |
| One local deployment job | Keeps wallet transaction execution out of the read application. Uses only the owned local fixture and packaged artifacts; host/private-key/testnet behavior is not broadened. |
| Explicit demo after startup | Prevents token minting, wallet writes and a seven-day Anvil time jump on ordinary startup/restart. Run serially; IDs come from receipts and every repeat creates new deposits. |
| Disposable chain with persistent DB/descriptor volumes | Retains the accepted foundation policy. Application-only restart works; losing Anvil's session requires an explicitly selected fresh project/reset. No durable chain snapshot or automatic deletion is introduced. |
| Internal bind versus host exposure | API binds all container interfaces so Docker can forward it, while host publication stays loopback. Native Ponder stays internal and no RPC/DB ports are published in this profile. This local unauthenticated fixture does not establish a production access policy. |
| Configuration and identity | Additional-block delay is shared by deploy/demo/indexer and still distinct from consensus finality. Changing persisted policy/build/history refuses reuse; API bind address/host port do not redefine the data scope. |
| Source and build context | A whitelist admits only application/build sources and canonical OpenAPI. Runtime image has no host .env, signing-key file, Docker socket, compiler or contract source. First build may download images/packages/compiler; runtime setup is not claimed to work from an empty offline cache. |
| Completion | L1-L5 require actual startup/demo/refusal evidence. New CI is configured, not remotely verified. S5 README/final-acceptance/candidate rehearsal remains separate. No commit/push or GitHub issue mutation is included without a new instruction. |

Primary references: [Compose readiness and completed dependencies](https://docs.docker.com/compose/how-tos/startup-order/), [service configuration](https://docs.docker.com/reference/compose-file/services/), [multi-stage builds](https://docs.docker.com/build/building/multi-stage/). These support packaging choices; actual behavior is backed by the pinned local execution above.

## Independent review

The subscription-only Opus/xhigh consult completed with exit 0 and empty stderr, verdict READY_WITH_FIXES and no architectural blockers. [Exact prompt](../claude/2026-11-09-docker-startup-prompt.md) and [unmodified response](../claude/2026-11-09-docker-startup-review.md) are retained. Response SHA-256: d3d28cb8e7fdbdae21ae7094430f19d7dcb654deca4dd95a643d85947bb8f591. Claude read the working tree/reports; it did not execute tests or verify remote CI.

| Finding | Codex disposition and verification |
| --- | --- |
| R1, required: directory re-inclusions defeated the build whitelist | Confirmed/fixed. Removed five broad parent-directory exceptions. Final image copies only six runtime/bootstrap scripts. Fresh-image inspection asserts no host .ponder cache, test directory, ambient generated file, application .env or Solidity source; this runs before any application-generated runtime cache can be confused with a host copy. All three new builds/startups passed. |
| R2, required: generic refusal could pass for an unrelated exception | Fixed. Wait for restarted Anvil health, then require deployment_identity_mismatch. Persisted-policy test requires persisted_scope_mismatch. DB outage also asserts database_unavailable in health/data, not just HTTP 503. |
| R3, required: verify live policy rather than the demo's environment only | Fixed. Demo checks public readiness/policy before its first transaction; final application observation must have the configured delay, headLag equal to it, eligibleBacklog=0. Driver checks those application fields independently at 0/2/6. |
| R4, required: documented demo and tested command differed; dependency convergence could reconfigure the running app | Addressed with a scoped alternative to the proposed fix. Both docs and driver use run --rm --no-deps demo after successful startup. Preflight rejects an unready application or a different demo delay before writes. A new negative case proves mismatch leaves nonce and active app healthy. Export/persist config for later up commands. Avoiding dependency convergence prevents a fresh shell from replacing the app with a different policy/port. |
| O1/O2: aggregate totals do not prove each recipient; printed parties were unchecked | Added per-action sender/beneficiary/escrow balance deltas, payout traces, party/token/amount assertions, post-expiry Pending getter and four terminal getter/API comparisons. Final demos passed these checks. |
| O3/O4: outage reason and descriptor-before-mining window | Assert the concrete DB reason. Publish the new descriptor only after setup mining succeeds, preventing reuse of a descriptor whose admission setup never completed. Host deployment/reuse regression passed again. |
| O5/O6: operational remedy and Compose compatibility | Document explicit reset after losing Anvil and observed Docker Engine 29.1.3/Compose 5.0.0. No untested minimum-version promise. |
| O7/O8: test poll interval and raw-spec/exposure checks | Automated driver remains 200ms for bounded acceptance; the exact operator startup/demo was also rerun with its default 1000ms. Raw OpenAPI must equal the canonical file byte-for-byte; image/Anvil/PostgreSQL inspection verifies no extra published service ports. |

The first post-review attempts uncovered a driver transport issue after its new negative command: synchronous Docker calls left an idle pooled HTTP socket closed before the next request (UND_ERR_SOCKET). The inferred cause is a delayed idle-close event while the driver's event loop is blocked. The driver now requests Connection: close for its own HTTP probes. No API/runtime keepalive behavior was changed or generic retry used to hide a failed assertion. The full reruns below passed after that correction; the failed attempts are retained as acceptance-reviewed-*.log.

## Final verification and remaining gates

Final acceptance driver SHA-256: 620797cafb4ef37212686b274d38c08cf987b1602fe48dfcedfde116088b076f. Additional implementation hashes are saved in ignored .local/docker-startup-2026-11-09/verified-source-hashes.json. All results below used the corrected build context, explicit demo preflight, payout/getter assertions, specific refusal checks and transport fix:

| Execution | Observed result |
| --- | --- |
| Default delay 2, remitee-app-check-96893-71941c8a | All 10 checks passed; 2 demos, mismatch refusal, startup/restart/DB/build/policy/lost-chain checks; owned resources removed. |
| Delay 0, remitee-app-check-97030-06465b06 | All 10 checks passed; app observation reports delay/lag 0 and eligible backlog 0; owned resources removed. |
| Delay 6, remitee-app-check-97155-356fa0c1 | All 10 checks passed; app observation reports delay/lag 6 and eligible backlog 0; owned resources removed. |
| Host regression after descriptor/mining correction | All 18 real indexer/API observations passed; remitee-indexer-check-97274-a890695c removed. |
| Final root/application types, 16 projection/config tests, OpenAPI, 7 API tests | Passed. |
| Final npm run check after context/image corrections | Foundation mining/SQL/failure/cleanup passed again; remitee-check-2742-73857dc5 removed. |
| Exact documented reviewer startup/demo | Passed against the normal project on localhost:3000 with default poll 1000ms, final image and --no-deps demo command. Runtime's existing descriptor hash equals the corrected packaged build hash, 0x7fb6e458da8d2c319c546c0b9a7f72e0b822f241ccd7664fc0b4f74260e37bca; no Solidity change/reset required. |
| Independent mismatched operator invocation | A child shell with another API_PORT and CONFIRMATION_DELAY failed demo preflight, sent no transaction, kept the same application container/nonce and left localhost:3000 ready. |

Logs are acceptance-final-{0,2,6}.log, host-regression-final.log, foundation-final.log and reviewer-*-final files under ignored .local/docker-startup-2026-11-09; detailed demo reports retain on-chain verification and four per-action payout traces. The normal reviewer stack remains running for the candidate; isolated test resources were removed. Its chain remains disposable, with explicit reset documented.

L1-L5/AC11 are complete locally with review dispositions and post-review execution; new CI is configured, not published/observed. No second Claude approval after these corrections is claimed. S5 candidate rehearsal/final acceptance and publication remain open. No commit, push or GitHub issue mutation was made in this slice.

Reviewer classifications are advice rather than new requirements: initialized submodules and unlocked local accounts already existed in S1/S2; Docker exposes that setup boundary more visibly. Exact build-hash refusal is intentionally stricter for the packaged fixture, while the separate host workflow retains validated descriptor reuse. The candidate can challenge the explicit separate demo, container bind choice, disposable session policy and packaging trade-offs without silently changing escrow rules.

Claude usage remaining, as reported by the runner:

- Current session: 85%; resets November 9 at 5:50am (America/Buenos_Aires).
- Current week, all models: 97%; resets November 15 at 12pm (America/Buenos_Aires).
