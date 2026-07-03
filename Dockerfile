# syntax=docker/dockerfile:1

########################################
# Build stage: compile TypeScript
########################################
FROM node:24-alpine AS build

# HUSKY=0 disables the "prepare: husky" script (no git hooks in CI/containers)
ENV HUSKY=0
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# Install all dependencies (including dev) against the locked manifest first
# so this layer is cached until the manifest changes.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Compile (tsc) and copy the static public assets into build/ (postbuild)
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

########################################
# Runtime stage: production-only image
########################################
FROM node:24-alpine AS runtime

ENV NODE_ENV=production HUSKY=0
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# Install only production dependencies
COPY --chown=node:node package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Bring in the compiled output (build/ already contains public/ from postbuild)
COPY --chown=node:node --from=build /app/build ./build

USER node

# Default port (override with the PORT env var). EXPOSE is documentation only.
EXPOSE 3511

# Uses the connector's own /status endpoint; honours a custom PORT.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3511}/status" >/dev/null 2>&1 || exit 1

CMD ["node", "build/index.js"]
