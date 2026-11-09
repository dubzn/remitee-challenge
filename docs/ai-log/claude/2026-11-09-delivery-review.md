# Delivery and manual-wallet review

I read the sources you listed and ran nothing. The CI run and test counts are your supplied evidence, not mine.

## 1. Submission verdict

**Ready to submit. I found no required-scope blockers.**

| Requirement | Evidence |
| --- | --- |
| Multi-ID escrow | `Escrow.sol:25-27, 53-64` — sequential IDs, a per-ID mapping, and `_lastEscrowId` set only after funding succeeds. |
| Exact 2h and 7d windows | `Escrow.sol:72, 81, 90, 99`. Cancel needs `< cancelDeadline`, confirm/reject need `< expiresAt`, and recover needs `>= expiresAt`. The boundaries are exclusive/inclusive and consistent with `IEscrow.sol`. |
| Terminal states and access control | `_pending` rejects any non-Pending record. `_requireCaller` enforces sender or beneficiary. `nonReentrant` is on every mutator. Status is written before the transfer, and a failed payout reverts. |
| Safe ERC-20 handling | `SafeERC20` covers tokens that return nothing. The before/after balance check rejects fee-on-transfer tokens. Token, beneficiary and amount are validated. |
| Events and getter | One event per transition, plus `getEscrow`. |
| Tests | 62 contract tests, including a separate adversarial-token file. |
| Indexing and reorg handling | Documented in the README (journal/checkpoint, 180s window, 503 on unverifiable reads). `docs/development.md` covers recovery. |
| API | `api/domain.ts` and `api/queries.ts` cover filters, pagination (`limit` ≤ 100, `hasMore`) and both transaction hashes. They also derive `ExpiredRecoverable`, `canCancel` and `canRecover` from the observed head timestamp. The `status=Pending` and `ExpiredRecoverable` filters are time-aware (`queries.ts:20-23`). |
| One-command setup and demo | `compose.yaml` and the README. |
| English README | Covers decisions, assumptions, improvements, HTTP examples and the AI appendix link. |

The README is honest about the main residual risks: issuer blacklists, a reorg after the last check, no authentication, and example-based tests only.

**Required fixes: none.**

**Improvements, in order of value:**
1. **Low, but do it before submitting.** `docs/manual-walkthrough.md` is untracked and nothing links to it. `grep` shows only the AI-log files mention it. Add a link from the README ("Run locally" or "Reference docs"), then commit it. Otherwise the candidate's manual path is invisible to a reviewer.
2. **Low.** The walkthrough's commands are not exercised by CI (see section 2). It is a hand-rehearsed document, so a Cast flag change would go unnoticed. Codex's isolated run is the right check. I would not add infrastructure for it.
3. **Informational.** `README.md:206` already names fuzz and invariant tests as the first addition. That matches reality, so I would leave it.

## 2. Manual walkthrough

The flow is correct as far as I can verify statically. I did not run Cast, so items marked "unverified" need Codex's run.

**Checked against the repository**
- **Signer selection.** Every sender action (`mint`, `approve`, `createEscrow`, the rejected `cancelEscrow`) uses index 0. The claim uses index 1. `--mnemonic` with `--mnemonic-index` signs locally, so it is not unlocked submission. The `0xf39F…` and `0x7099…` prefixes are the standard Anvil accounts 0 and 1.
- **Amounts.** `MockERC20` is a plain OpenZeppelin `ERC20`, which defaults to 18 decimals, so `1000000000000000000` is one TEST token. `mint` is unrestricted (`MockERC20.sol:10`).
- **Deployment lookups.** `deploy-local.ts:79-85` writes `address` and `localTokenAddress` into `deployment.json`, which the walkthrough reads. `Dockerfile.app:20` puts the built ABI at `/app/artifacts/Escrow.json`, and the working directory is `/app`. The script resolves `viem` the same way the shipped scripts do.
- **Receipt parsing.** It uses `parseEventLogs` on the real ABI and takes `created.args.id`. That avoids assuming ID 1 and avoids racing the indexer. Because `EscrowCreated.id` is `indexed`, viem decodes it from the topics, so this should work. A failed transaction makes `cast send` exit non-zero.
- **Confirmation delay.** Ponder sees block N once N+2 exists, so mining `CONFIRMATION_DELAY` blocks after each transaction is the right amount. With delay 0, `anvil_mine 0` mines nothing, which is harmless. The existing integration tests send numeric `anvil_mine` params, so `cast rpc anvil_mine 2` should be accepted. That is also unverified.
- **API checks.** Addresses are lowercased server-side (`domain.ts:92`), so the checksummed `$SENDER` and `$BENEFICIARY` work in filters. Status names match. Resolution hashes exist only for non-Pending escrows (`domain.ts:166`), so null-then-set is correct.
- **ID reuse and existing balances.** IDs come from the receipt, and the list queries are scoped by sender, beneficiary and status. The walkthrough already says to compare balance changes rather than assume zero.
- **The terminal-state revert.** `cancelEscrow` on a Released escrow hits `_pending` first, which reverts with `EscrowNotPending`. Cast will normally fail at gas estimation and print the selector or decoded error.

**Issues, none blocking**
1. **Silent failure in ID capture (medium readability).** `ESCROW_ID=$(… | node …)` has no `pipefail`. If the `cast send` fails or prints nothing, `node` errors, `ESCROW_ID` is empty, and the following commands run with an empty ID. Add `test -n "$ESCROW_ID" || echo STOP` after the assignment, or set `set -o pipefail`. In a pasted terminal, `set -e` is a bad idea.
2. **Balances are not stored (medium readability).** The text says "relative to the balances recorded before creation", but nothing records them, and the beneficiary balance is not re-read after creation. The reader must scroll back and subtract 18-digit numbers by eye. Capture `BEFORE_SENDER`, `BEFORE_BENEFICIARY` and `BEFORE_ESCROW` into variables, or print them once more right before `createEscrow`. `cast call` may append `[1e18]`, so use `--json` or `cut -d' ' -f1` if you compute differences.
3. **Pending API check can show a 404.** The text covers this ("a temporary 404 is not a reason to resubmit"). Add a simple bounded retry loop only if the rehearsal shows that the 1-second poll plus a few seconds is flaky.
4. **Mnemonic on the command line (low).** The phrase is public and local, and `--mnemonic` appears in process arguments. The existing warning about not using real funds is enough.
5. **`API_PORT` default (nit).** The walkthrough uses `${API_PORT:-3000}` but `compose.yaml` uses `${API_PORT-3000}`. They differ only if `API_PORT` is set to an empty string. This is not worth changing.
6. **Wrong-caller check is described, not scripted (informational).** "Create another escrow … then try `confirmEscrow` with index 0" is clear enough. Say that this second escrow needs its own mint and approve, or point to an allowance of 2 × `AMOUNT`. As written, "using the funding, approval and creation steps" covers it.
7. **Demo state and time (informational).** The README says the demo advances Anvil by seven days. That only shifts the chain clock. New escrows still get relative deadlines, so `canCancel: true` right after creation holds on an already-used stack.

## 3. Candidate rehearsal checklist

- [ ] Clean `docker compose --profile app down -v`. Bring the stack up with the README command and confirm `/health` returns 200.
- [ ] Run the manual flow on a fresh stack, then again after `docker compose --profile app run --rm --no-deps demo` so there is existing data and nonzero balances. Confirm the ID is not 1 the second time.
- [ ] Say aloud which index signs each step. Explain why the beneficiary needs no approval and why the sender needs the allowance.
- [ ] Explain why `1000000000000000000` is one token (18 decimals, raw units).
- [ ] After create: show `getEscrow` status 0 and the balance moves. Mine `CONFIRMATION_DELAY` blocks, then show the API with `Pending`, `canCancel: true`, `canRecover: false`, and the creation hash.
- [ ] After confirm: show status 2, the balance deltas, and API `Released` with a resolution hash that matches the receipt.
- [ ] Reproduce the `EscrowNotPending` revert and the `UnauthorizedCaller` revert. Then show that index 1 can still confirm.
- [ ] Rehearse with `CONFIRMATION_DELAY=0` in a throwaway project. Confirm the walkthrough still works with `anvil_mine 0`.
- [ ] Be ready to answer these questions:
  - Why does the beneficiary's confirmation win over the 2-hour cancellation window?
  - What does `ExpiredRecoverable` mean, and why is it derived rather than stored?
  - What happens on a reorg, and why can the API return 503?
  - What breaks if the token is fee-on-transfer or blacklists the escrow?
- [ ] Confirm the README links the walkthrough before submitting, and that everything is committed.

## Uncertainty

- I did not run Cast or Docker. The `cast wallet address --mnemonic`, `cast send --mnemonic-index`, and `cast rpc anvil_mine <number>` forms, and `cast send --json` receipt shape (including that `logs` carries `topics` and `data`), are what Codex's isolated run should confirm.
- I also did not open the test sources, `projection.ts`, `store.ts` or `rpc.ts` in depth. My verdict on indexing idempotency and reorg handling rests on the README, the 18 + 16 + 19 + 13 test counts and the green CI run you supplied, not on my own reading of that code.

Claude usage remaining:
- Current session: 67% remaining · resets Nov 9 at 9:50pm (America/Buenos_Aires)
- Current week (all models): 89% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
- Current week (Fable): 100% remaining · resets Nov 15 at 12pm (America/Buenos_Aires)
