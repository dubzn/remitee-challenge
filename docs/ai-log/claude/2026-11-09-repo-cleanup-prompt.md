Review the current documentation cleanup in this repository. Read-only review, no implementation.

Goal: a concise, first-person project README for the author submitting an escrow challenge; current setup, decisions, assumptions, limitations and future improvements belong in that README. Historical AI/session records and earlier plans have been moved byte-for-byte into docs/ai-log/{codex,claude,planning}. Prefer clarity over volume. Do not read the historical archive or suggest more process documents.

Read README.md, docs/development.md, docs/api/README.md, docs/postgres-models.md, docs/contract-flows.md, docs/sdd/escrow.md and docs/ai-log/README.md. Check specific implementation claims only as needed in compose.yaml, Dockerfile.app, contracts/src/Escrow.sol, apps/indexer/api/, apps/indexer/read-model.ts and apps/indexer/ponder.schema.ts.

Related cleanup: experiments/ponder-poc was an isolated, superseded proof of concept and is removed along with its root command. The internal /observed facade was used only by earlier acceptance checks. Those checks now use the actual public read API, assert old engine routes return 404, and still verify sibling engine shutdown through native /ready. The minimal Hono export in apps/indexer/src/api/index.ts must remain: installed Ponder 0.18.5 requires it to build its native health/readiness server. Public HTTP behavior and Solidity are unchanged. The canonical OpenAPI file has moved to docs/api/openapi.yaml with all live consumers updated.

Independent verification so far: 18 actual Ponder/PostgreSQL/HTTP integration observations passed after removal; 16 indexer units and 7 API units passed; OpenAPI examples/negative fixtures passed; root/indexer type checks passed. Full Docker acceptance is being rerun for the moved spec/build context. Treat test results as supplied evidence, not a substitute for checking a questionable claim.

Return at most 500 words, in English:
1. Any material documentation errors with file/claim and smallest correction.
2. Up to five concrete cuts that improve concision without hiding important trade-offs.
3. Whether the README reads as the author's explanation, and whether appendix navigation clearly distinguishes history from current instructions.
Do not propose new features or broader architecture changes. If no blocking problems, say so plainly. Do not claim to have run tests.
