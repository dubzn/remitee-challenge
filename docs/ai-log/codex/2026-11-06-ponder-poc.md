# Ponder proof: results and fallback decision

Subsequent status: [bounded follow-up executed and Ponder selected](2026-11-06-ponder-decision.md). Decisions in this document record the earlier stage; production integration remains pending.

Date: 2026-11-06. Initial decision: **retain the planned RPC polling worker**. That conclusion is now reopened by the [independent Opus/xhigh review and Codex disposition](2026-11-06-indexer-validation-disposition.md); engine selection is pending a bounded follow-up. The candidate authorized a Ponder PoC and that fallback if the integration did not behave correctly. The experiment and decision were completed within the 60-minute timebox. This is not implementation or acceptance of the production indexer.

## Reproduction and scope

Source: [experiments/ponder-poc](../../../experiments/ponder-poc/run.ts). Commands/prerequisites: [bounded spike](../../spikes/004-ponder-poc.md). Versioned, sanitized observations: [results JSON](2026-11-06-ponder-poc-results.json).

Pinned Ponder 0.18.5, viem 2.57.16, Hono 4.13.16 and pg 8.23.1 in a separate package/lockfile; Node 24.14.1, PostgreSQL 17.11 and the existing Foundry 1.4.1/Solidity 0.8.30 image. The driver compiles the actual Escrow/MockERC20, checks the event ABI and deploys them to a unique Anvil/PostgreSQL Compose project. Ports bind to loopback with generated numbers. It uses only that Anvil's unlocked development accounts. Existing remitee-local services are not reset or used.

The driver tests `ponder start` and real PostgreSQL/GraphQL, not PGlite, mocked storage or development-mode table rebuilding. Raw process logs and test artifacts remain under ignored `.local`; owned processes, containers, network and volume were removed afterward. Isolated table creation is not a production migration.

## Observations

| Probe | Observed result |
| --- | --- |
| P1: history, five events and amounts | PASS: five escrows/nine events; all four terminal outcomes plus Pending; parties/deadlines match source facts; amount `2^200` stays exact in PostgreSQL and GraphQL |
| P2: restart/catch-up | PASS: same schema/build resumes and includes a creation while offline; seven escrows/eleven events without duplicates |
| P3: hard kill inside handler | PASS: driver waits 1.2 seconds after journal insertion and before projection, observes neither row committed, kills the process and restarts; eight escrows/twelve events afterward |
| P4: competing instance | PASS: another instance cannot write the same schema; readiness is not 200 and journal count stays unchanged |
| P5: native shallow reorg | PASS: a Released event is orphaned, its row disappears and canonical Rejected replaces it |
| P5: reset/redeploy same address | PASS as safe refusal: native restart exits 1 and serves no ready API; old rows remain preserved, not automatically deleted or silently reinterpreted |
| P6: native admission | INTEGRATION GAP: a creation is publicly visible with zero additional blocks instead of the proposed two |
| P6: RPC unavailable | INTEGRATION GAP: native `/ready` stays 200 while the controlled RPC proxy rejects requests |
| G1: delayed read transport | PASS: an adapter delays the RPC view by two blocks; creation is absent at depths 0/1 and visible at 2 |
| G2: HTTP observation guard | PASS: identity validation plus native readiness returns GraphQL 503 while RPC is unavailable |
| G3: fork before admission | PASS: provisional rejection never enters the projection; the replacement release is admitted after the delay |
| G4: admitted mismatch | INCOMPATIBLE WITH CURRENT POLICY: after a verified same-height/different-hash reorg, native `/ready` and guarded GraphQL return 200 with Released while the actual contract is Rejected |
| G5: explicit replay | PASS: a fresh, explicitly selected schema rebuilds the canonical Rejected outcome, with two journal rows and no orphan release |

The native profile uses `reorgWindow=180`. The guarded profile uses a read-only delayed transport, deployment/genesis identity checks, an HTTP read guard and `reorgWindow=0` to test the SDD's halt-on-admitted-mismatch policy. Ponder still owns synchronization, locks and checkpoints; no competing writer was added.

## What G4 establishes and what it does not

The driver first admits a Released outcome at block 8 after two extra blocks. It then temporarily hides RPC reads while replacing that history, restores the same head height with a different block-8 hash and verifies Rejected directly from the contract. This avoids mistaking a transient lower head for a verified fork.

Ponder logs `Encountered unrecoverable reorg` with finalized_block 8. At the single HTTP sample taken after that log in each reproduction, the responses were nativeReady 200, GraphQL 200 and publicOutcome Released. The test did not measure how long this lasted or the eventual process exit. Source inspection in the pinned package confirms `/ready` reads the backfill `is_ready` flag; it is not a canonical-history/freshness guarantee. The tested guard verifies the deployment anchor and native readiness, so it does not detect an orphaned later checkpoint by itself.

This does not show that every Ponder integration is unsafe or that the framework cannot be hardened. A facade could add independent verification of projected checkpoints and its own read-readiness state. Codex initially stopped adapter work and favored the handwritten design. Independent review corrects that comparison: both engines need canonical projected-checkpoint verification, and a working polling implementation does not exist yet. G4 used reorgWindow=0, so every admitted reorg is beyond the configured recovery window. The tested guard fails that chosen policy, but this does not compare a positive-window Ponder integration with a complete polling worker.

The initial harness iterations corrected ABI default normalization, Ponder's transaction-hash location, API scaffolding and waiting for the full expected dataset. Those were fixture/integration corrections, not framework defects. The retained final run completed every probe and reproduced G4 through the public HTTP boundary; its exit code 0 means the experiment completed, not that Ponder passed production acceptance.

## Next decision boundary

Before selecting an engine, propose one bounded test of a Ponder application-owned checkpoint and public-read guard with a positive recovery window; see the [independent review disposition](2026-11-06-indexer-validation-disposition.md) for pass/fail and stopping conditions. It is not executed. The viem/pg worker and [PostgreSQL model](../../postgres-models.md) remain the fallback. Application readiness must validate projected history with either engine.

The Ponder dependency stays confined to the experiment. Root foundation checks and the approved contracts are unchanged. PoC typecheck and root typecheck pass locally; the framework experiment is not part of existing CI. No testnet/provider account was used, no production migration was applied and issue #4/AC6-AC8 remain open. The original experiment was executed by Codex. A later independent Claude Opus/xhigh review challenged the engine-selection conclusion; Claude did not execute runtime tests.

GitHub tracking: [#4](https://github.com/dubzn/remitee-challenge/issues/4) records the initial published polling selection and stays open; the local review now reopens that choice before another commit. [#10](https://github.com/dubzn/remitee-challenge/issues/10), labeled enhancement, tracks future Ponder hardening outside this deliverable.
