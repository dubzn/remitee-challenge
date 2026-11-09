# Indexer alternatives and PostgreSQL design review

Subsequent status: [bounded follow-up executed and Ponder selected](2026-11-06-ponder-decision.md). Decisions in this document record the earlier stage; production integration remains pending.

Date: 2026-11-06. The candidate asked how indexing was planned, whether an existing product could cover local/testnet use, and for PostgreSQL model documentation.

## Result

The earlier SDD/recovery spike contained a worker proposal, not implementation. Added [dedicated indexer design](../../indexer-design.md) and [PostgreSQL models](../../postgres-models.md), retaining the SDD as the canonical acceptance specification.

The provider review distinguishes standard RPC, hosted webhooks and a self-hosted indexing engine. Alchemy's [official notice](https://www.alchemy.com/docs/alchemy-subgraphs/deprecation-notice) confirms its Subgraphs product closed on Dec 8, 2025. Its [Sepolia RPC](https://www.alchemy.com/docs/choosing-a-web3-network) remains a possible input for the same local/testnet worker. Ponder documents [Anvil support](https://ponder.sh/docs/guides/foundry), [PostgreSQL](https://ponder.sh/docs/database) and [chain/reorg configuration](https://ponder.sh/docs/config/chains), making it a viable alternative rather than an assumed incompatibility.

The initial recommendation was one viem/pg polling worker for this bounded scope; this is an engineering inference, not an adopted candidate choice. Ponder deserves a bounded compatibility proof if selected. A framework can replace our engine-specific decisions; it must still demonstrate the challenge's required observable behavior.

## Model decisions and verification limits

Proposed three tables: indexer_state, escrow_events and escrows. Documented identity isolation, exact integer storage, event uniqueness/conflict detection, composite references, ordered atomic range application, read snapshots and explicit replay. Effective expiry/eligibility remain derived, not stored transitions. No users/token-metadata tables, custody ledger, broker or provisional journal was added.

Sources were read on Nov 6, including direct retrieval of official Ponder pages when the browsing reader could not parse their Markdown content. Documentation was checked against the frozen contract events and existing SDD. Repository Markdown links and English/Spanish document structure are checked separately; no runtime correctness is established by these design checks.

No new Claude invocation, dependency installation, provider subscription, testnet deployment, indexer implementation or database migration was performed. AC6-AC8 remain unverified. The next implementation must resolve the engine choice, pin dependencies and execute the real PostgreSQL/Anvil acceptance suite.

Follow-up: the candidate asked for a Torii analogue. The dedicated design now distinguishes MUD Store indexing (protocol-aware architectural analogue) from Ponder/Envio for ordinary Solidity events. Prioritize the bounded Ponder compatibility proof before committing to the handwritten engine; no implementation choice has been adopted.

Runtime follow-up: the authorized [Ponder proof](2026-11-06-ponder-poc.md) is now complete. It selects the polling fallback; this earlier source review is not the final engine decision.

Independent-review follow-up: [Opus/xhigh validation and Codex disposition](2026-11-06-indexer-validation-disposition.md) find the engine rejection premature. Engine choice is reopened; the original experiment remains valid evidence for its tested guard only.
