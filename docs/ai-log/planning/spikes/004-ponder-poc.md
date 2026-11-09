# Ponder compatibility proof

Date: 2026-11-06. Status: initial and follow-up proofs complete; **Ponder selected**. [Final decision](../outputs/codex/2026-11-06-ponder-decision.md). [Executed results](../outputs/codex/2026-11-06-ponder-poc.md) and [Opus/xhigh disposition](../outputs/codex/2026-11-06-indexer-validation-disposition.md). Candidate authorized a Ponder PoC, with the existing RPC polling design as fallback if behavior is unsuitable. Timebox: 60 minutes from the existing indexer budget. This does not authorize claiming full S2/AC6-AC8 acceptance or replacing the approved contracts.

## Decision and scope

Use the actual Escrow and a test ERC-20 on isolated Anvil/PostgreSQL. Pin Ponder and run `ponder start`, not development hot reload, to examine persistence. Keep dependencies, schema and handlers inside `experiments/ponder-poc`; no production schema or worker is installed.

## Acceptance probes

| ID | Probe | Evidence required |
| --- | --- | --- |
| P1 | Initial history and five events | Exact amounts/parties/deadlines and all four outcomes agree with on-chain facts; PostgreSQL stores large uint256 losslessly |
| P2 | Restart and live catch-up | Same schema/build resumes without duplicate rows or repeated effects |
| P3 | Abrupt interruption | A kill during a handler does not leave a committed journal/projection mismatch; restart catches up |
| P4 | Competing instance | Second instance cannot write the same deployment schema concurrently |
| P5 | Replaced history | Live fork/reset/restart must not silently serve orphaned escrow outcomes as ready |
| P6 | RPC failure and admission policy | Observe readiness during RPC loss and whether data is exposed before two additional blocks; distinguish engine defaults from bugs |

The last two probes compare actual framework behavior with the current SDD. A framework using different internal tables or automatic rollback is not automatically incorrect. Record whether a small, explicit integration can preserve the observable requirements; avoid implementing a second engine to compensate.

## Reproduction

Use the pinned Node version and a running Docker engine. Initialize the existing contract submodules, then install the experiment's independent lockfile.

```sh
git submodule update --init --depth 1
npm --prefix experiments/ponder-poc ci
npm run poc:ponder
npm --prefix experiments/ponder-poc run typecheck
```

The driver generates Ponder's ignored ambient types on startup; run its typecheck after the PoC. Root `npm run typecheck` excludes the experiment. The PoC is not in CI. Exit 0 means all probes completed; read its decision/result classifications, not a claim that all compatibility gates passed. Logs/reports are retained under ignored `.local/remitee-poc-ponder-*`; generated containers/volumes are removed in finally. The only active development services remain remitee-local.

## Independent review gate

The original runner decision is a historical heuristic, not the current engine selection. G4 is a negative control for a guard without projected-checkpoint validation and a zero recovery window. One proposed follow-up uses an app-owned public block-handler checkpoint and a positive recovery window. That proposed follow-up has now executed and selected Ponder; the original hard three-hour stop applied; see the disposition for pass/fail, seconds-versus-blocks and reserved-health-route constraints. Polling remains the fallback, not a verified production engine.

## Exit

Recommend Ponder only with proven behavior and a bounded list of remaining integration work. Otherwise retain polling RPC and document the exact mismatch. Preserve the experiment, commands, versions, results and limitations in a Codex output. Cleanup is restricted to the generated PoC containers/volumes/processes; never reset `remitee-local`.

## Authorized follow-up (November 6)

The candidate authorized executing the bounded decision proof and separating projection rules from persistence. Scope: extend the isolated experiment only; select one engine using observed behavior, without claiming production S2/S3 completion.

- F1: a public block handler stores the latest projected number/hash/timestamp, including empty blocks. Data and checkpoint are read in one SQL statement.
- F2: two-additional-block admission and positive timestamp-based recovery coexist. During a controlled within-window fork, no sampled successful response contains the orphan outcome; eventual state is canonical.
- F3: beyond-window mismatch makes the application data and health endpoints unavailable for 60 seconds and after restart; an explicit fresh-schema replay restores canonical reads.
- F4: duplicate delivery and abrupt termination cannot commit a journal/projection/checkpoint mismatch. Same-build restart preserves exact event counts.
- F5: projection rules depend on a small persistence interface. Only the Ponder adapter uses context.db; no second pg writer or independent transaction from event handlers.

Use supported prefixed application routes to avoid reserved native health routes. Preserve the original report and append new evidence separately. Engine choice closes when these probes finish or the three-hour maximum expires. Residual chain/database races remain explicit.

## Follow-up result

F1-F5 completed in the isolated experiment; select Ponder. [Evidence, limitations and policy](../outputs/codex/2026-11-06-ponder-decision.md). Production integration, API and CI remain pending; the preceding follow-up requirements are retained as the historical test plan.
