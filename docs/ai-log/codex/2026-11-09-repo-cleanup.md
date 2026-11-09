# Repository cleanup

I committed the Docker startup/demo first as 66d1b7e and its prior review/acceptance evidence as a50048b. I then separated removal of unused code (82ea0a5) from the documentation consolidation.

I made the README the author's first-person explanation of setup, rules, decisions, assumptions, limits and improvements. Current guides cover HTTP, contract flows, PostgreSQL, development/recovery and the behavior checklist. I moved 79 historical files into this appendix without changing their bytes; the unchanged canonical OpenAPI file moved separately to docs/api/openapi.yaml. I verified all 80 moves by SHA-256 and checked current local documentation links. Historical links remain snapshots, as the appendix index explains.

I removed the isolated experiments/ponder-poc and its unused command. I replaced internal /observed acceptance reads with schema-validated public API requests, asserted both retired routes return 404, and retained native /ready to prove sibling-engine shutdown. Ponder 0.18.5 requires its Hono API entry module, so the empty export remains. Contract behavior and the public HTTP contract are unchanged. All live OpenAPI consumers and the Docker build allowlist use the new path.

Local verification after these changes:

- Root/indexer type checks; 16 indexer units and 7 API units passed.
- OpenAPI validation passed: 14 response-example uses and six rejected invalid fixtures.
- Actual PostgreSQL/Ponder/HTTP integration passed all 18 observations, including write interruption, duplicate delivery, restart, forks and replay.
- Fresh Docker acceptance passed all 10 checks, including two demos, restart, outage and incompatible-state refusals. Only its own resources were removed.
- Contract reference generation passed inherited NatSpec checks and 98 local targets across five pages. Solidity was unchanged; I did not repeat the contract behavior suite for this cleanup.
- The existing default Docker project rebuilt successfully, retained its session, returned public health 200 and internal /observed routes 404.

[Opus/xhigh review](../claude/2026-11-09-repo-cleanup-review.md) found no blockers. I applied its query/readiness/eligibility wording corrections and cuts, checked the relevant code, and preserved the raw response. The review was static; the checks above were executed independently. No new remote CI result was observed.
