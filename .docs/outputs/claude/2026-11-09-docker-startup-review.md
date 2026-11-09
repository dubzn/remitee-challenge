## Verdict: READY_WITH_FIXES

There are no blockers. The design holds on every point I checked, and four small fixes are required before closing local S4. Those fixes change the image and the driver, so the acceptance runs must be repeated afterwards.

This is a static review and I ran nothing. Logs and reports are Codex's observations. Points marked *inference* come from how Docker and Compose behave, not from anything in the repo.

**Delay 0 and 6 evidence:** both logs now show 9/9 passes plus cleanup (`acceptance-delay-0.log:6-15`, `acceptance-delay-6.log:6-15`). Both reports show the API's own observation carrying that delay (`.local/remitee-app-check-90160-2cc8e378/report.json:46,136`, `.local/remitee-app-check-90280-fe9d8c44/report.json:46,136`). The fourth, delay-0 and delay-6 logs are newer than every listed source, but timestamps don't prove content.

## Required fixes

### R1 (Medium): `.dockerignore` is not a whitelist
- **Cause:** the bare `!apps/`, `!apps/indexer/`, `!contracts/`, `!.docs/` and `!.docs/api/` (`.dockerignore:8,9,17,28,29`) each re-admit their whole tree (*inference*: Docker's matcher applies a negated directory to its descendants).
- **Present on this host and admitted:** `apps/indexer/.ponder/vite/deps/*` and `apps/indexer/test/*` reach the final image via `Dockerfile.app:16`. `contracts/cache/solidity-files-cache.json` reaches the build stage only.
- **Latent risk:** an `apps/indexer/.env` would also reach the runtime image, and the driver only checks `/app/.env` (`scripts/compose-acceptance.ts:60,65`).
- **Contradicted claims:** `.docs/outputs/codex/2026-11-09-docker-startup.md:54` and `.docs/docker-demo.md:35`.
- **Fix:** delete those five lines, since Docker doesn't need parent directories re-included. Then list `/app/apps/indexer` in a built image to confirm. Line 35 should also admit that all of `scripts/` ships.

### R2 (Medium): two refusal checks can pass for the wrong reason
- **Cause:** `/INDEXER_START_REFUSED/` and `/LOCAL_DEPLOY_REFUSED/` (`scripts/compose-acceptance.ts:121,132`) match prefixes printed for any exception (`scripts/indexer.ts:83-86`, `scripts/deploy-local.ts:58-62`).
- **Race:** deploy runs straight after `restart anvil` with no health wait (`:129-130`), so "Anvil isn't up yet" would count as lost-chain refusal.
- **Fix:** add `up -d --wait anvil`, as line 109 does for PostgreSQL. Then match `deployment_identity_mismatch` (`apps/indexer/rpc.ts:58`) and `persisted_scope_mismatch` (`apps/indexer/read-model.ts:24`).

### R3 (Medium): the delay assertion checks the demo, not the application
- **Cause:** `scripts/compose-acceptance.ts:77` compares the demo's own `admissionDelay()` (`scripts/demo.ts:115`). Nothing asserts the application's policy, so the 0/2/6 runs would pass if the indexer ignored the setting. The reports show correct values, so this is a test gap rather than a behaviour bug.
- **Fix in the demo:** before the first transaction, assert that `/health` `observation.confirmationDelay` equals `admissionDelay()`.
- **Fix in the driver:** assert `data.observation.confirmationDelay === N`, `headLag === String(N)` and `eligibleBacklog === '0'`.
- **Why this is deterministic:** after the last admitted event at block B, head is B+N, and a 200 requires indexed ≤ head−N (`apps/indexer/read-model.ts:112-113`). Recorded head/indexed values fit: 13/13, 21/19, 37/31.

### R4 (Medium): the documented demo command is untested and can break the app
- **Mismatch:** the driver uses `run --rm --no-deps demo` (`scripts/compose-acceptance.ts:73`), while the docs use `run --rm demo` (`.docs/docker-demo.md:42`).
- **Failure (*inference*):** without `--no-deps`, Compose re-converges dependencies using the current shell's environment. After the prefix form on `.docs/docker-demo.md:19`, a plain demo recreates `application` on port 3000.
- **Worse case (*inference*):** `CONFIRMATION_DELAY=6` as a prefix recreates it with delay 2. It then refuses the persisted scope and takes the working app down. Line 69's "use the same value" only holds if the value is set for both commands.
- **Why tests miss it:** the driver applies one environment to every command (`:14,22`).
- **Fix:** document `export` or `.env`, and drop `--no-deps` at line 73. If Compose progress then lands on stdout, parse from the start of the JSON object rather than restoring the flag.

### After the fixes
Re-run acceptance at delay 0, 2 and 6, then update `.docs/outputs/codex/2026-11-09-docker-startup.md:33,54` and tick the SDD boxes (`.docs/sdd/escrow.md:185-189`).

## Optional findings (all Low)

| ID | Location | Issue | Disposition |
| --- | --- | --- | --- |
| O1 | `scripts/demo.ts:110-112` | Totals can't show which path paid; swapped cancel/confirm recipients give the same sums. Forge covers AC2 and the docs describe totals accurately. | Accept, or add per-action deltas |
| O2 | `scripts/demo.ts:81-84` | API sender, beneficiary and token are printed but not asserted. | Add three asserts |
| O3 | `scripts/compose-acceptance.ts:106-107` | The outage check tests status only, not `database_unavailable`. | Add with R2 |
| O4 | `scripts/deploy-local.ts:50-55` | The descriptor is written before mining; a crash between them leaves reuse that never mines. | Move mining first |
| O5 | `.docs/docker-demo.md:71-82` | No failure-to-remedy line. `down`, `stop` or a Docker restart all lose the chain. | Add one sentence |
| O6 | `.docs/docker-demo.md:7` | No Compose version stated; `--wait` with a one-shot dependency needs a recent one (*inference*). | Record the observed version |
| O7 | `scripts/compose-acceptance.ts:14` | The driver polls at 200 ms, so the 1000 ms default isn't exercised. | Cover in S5 rehearsal |
| O8 | `scripts/compose-acceptance.ts:59,69` | OpenAPI is regex-checked only, and Anvil/PostgreSQL bindings aren't asserted (`compose.yaml` publishes none today). | Defer |

## Your five questions

1. **No-host startup: yes, given initialized submodules.** Compose mode uses packaged artifacts and never compiles (`scripts/deploy-local.ts:16,30`). The ordering is correct (`compose.yaml:57-61,70-72`), and readiness is real `/health` (`:79-84`). Deploy mines enough blocks for idle Anvil to reach it (`scripts/deploy-local.ts:55`). A cold machine and remote CI remain unobserved.
2. **Write boundaries: yes, and failure semantics are honest.**
   - RPC/API destinations are exact matches, with chain and identity checks before any transaction (`scripts/deploy-local.ts:14,19,23-24`, `scripts/demo.ts:18-19,25-27,39`).
   - The read allowlist is intact (`apps/indexer/rpc.ts:14`, `apps/indexer/test/unit.test.ts:179`).
   - `/state` is read-only for the app (`compose.yaml:74`).
   - Scope ignores bind/port and `localTokenAddress` (`apps/indexer/config.ts:58-69,100-102`).
   - No code path deletes data automatically.
3. **Demo evidence: meaningful, apart from R2–R4.**
   - IDs are receipt-derived (`scripts/demo.ts:68-71`), actors are correct (`:74-77`), and receipts must succeed (`:42`).
   - Hashes are compared (`:82-83,107-108`), and expiry is shown at the exact boundary before recovery (`:89-97`).
   - Stale reads can't satisfy `Expired`, because the prior state is `ExpiredRecoverable` (`:57,104`).
   - Mining is explicit, with no idle waiting.
4. **Packaging: correct apart from R1.**
   - The non-root user and volume setup are right (`Dockerfile.app:22-23`), as are the loopback publish (`compose.yaml:75-76`) and internal Ponder (`scripts/indexer.ts:63-66`).
   - There is no `compose.override.yaml`, and `compose.local.yaml` loads only for `remitee-local` (`scripts/infra.ts:18`).
   - Cleanup is project-scoped (`scripts/compose-acceptance.ts:11,143-146`, `.github/workflows/foundation.yml:201-210`).
5. **Decisions for the candidate:**

| Decision | Origin | Attention needed |
| --- | --- | --- |
| 2h/7d timing, first success wins, simple ERC-20 | Inherited | None; unchanged |
| Additional-block delay, default 2 | Inherited | Be ready to explain that delay is not finality |
| Disposable chain with persistent DB and descriptor | Inherited, more visible now | Rehearse refusal and reset; this is the likeliest live surprise |
| Anonymous read API | Inherited (S3, #14 is future) | None |
| Whole reviewer path, including Node, in Docker | Candidate preference | Own the trade-off: extra build stage, image and deploy job |
| Submodule init before the "one command" | New in S4 | Decide the README wording; a source ZIP won't work |
| Demo as a separate command, jumping about 7 days per run | New, fits AC11 | Confirm |
| `API_HOST=0.0.0.0` in-container, loopback publish | New | Confirm; still unauthenticated |
| Unlocked Anvil accounts as the only write authority | New use of the local fixture | Confirm |
| Exact code-hash build refusal | New | A comment-only Escrow edit likely forces a reset too, as `foundry.toml` keeps metadata hashing (*inference*) |

**Recommendation:** apply R1–R4, re-run at all three delays, then close local S4. S5 rehearsal and the remote CI observation stay open. This review is advice only and doesn't authorize publication.

Claude usage remaining:
- Current session: 85% remaining · resets Nov 9 at 5:50am (America/Buenos_Aires)
- Current week (all models): 97% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
