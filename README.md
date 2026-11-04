# Remitee escrow challenge

Local infrastructure and the foundation CI workflow are implemented. The escrow contract, indexer, API and full lifecycle demo are not implemented yet.

- [Local setup, commands and verification](.docs/local-development.md)
- [Specification and planning index](.docs/README.md)
- [Work tracker](https://github.com/dubzn/remitee-challenge/issues)

Use Node 24.14.1/npm 11.11.0 and Docker Compose with a running Docker engine. After `npm ci`, `npm run infra:up` starts local Anvil/PostgreSQL; `npm run check` verifies the isolated foundation. No production credentials are required.
