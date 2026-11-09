# Keep this Foundry image in sync with the Anvil image in compose.yaml.
FROM ghcr.io/foundry-rs/foundry:v1.4.1@sha256:629bebb49d1ba44a52a9fc14229dd58930e3193b4b206ae43ad00089e9ead95b AS contracts
USER root
WORKDIR /build
COPY contracts/ ./
RUN forge build

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/indexer/package.json ./apps/indexer/package.json
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
WORKDIR /app
COPY --chown=node:node --from=dependencies /app/ ./
COPY --chown=node:node apps/indexer/ ./apps/indexer/
COPY --chown=node:node scripts/indexer.ts scripts/read-api.ts scripts/deploy-local.ts scripts/demo.ts scripts/build-artifacts.ts scripts/deployment-manifest.ts ./scripts/
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node docs/api/openapi.yaml ./docs/api/openapi.yaml
COPY --chown=node:node --from=contracts /build/out/Escrow.sol/Escrow.json ./artifacts/Escrow.json
COPY --chown=node:node --from=contracts /build/out/MockERC20.sol/MockERC20.json ./artifacts/MockERC20.json
RUN mkdir /state && chown node:node /state
USER node
CMD ["node", "scripts/indexer.ts"]
