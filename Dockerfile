# Haqdar API for Google Cloud Run.
# Three stages: build with dev dependencies, install production dependencies alone,
# then a small runtime image that holds only those and the compiled app.

ARG NODE_VERSION=22.22.2
ARG PNPM_VERSION=9.15.9

# ── 1. Build ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
WORKDIR /app
# npm installs pnpm directly: some Node 22 releases bundle a corepack with outdated signing keys.
RUN npm install -g pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build

# ── 2. Production dependencies only ─────────────────────────────────
FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
WORKDIR /app
# npm installs pnpm directly: some Node 22 releases bundle a corepack with outdated signing keys.
RUN npm install -g pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ── 3. Runtime ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# Never run as root inside the container.
USER node

# Cloud Run sends traffic to $PORT (8080 by default); the app reads PORT.
ENV PORT=8080
EXPOSE 8080

# Database migrations run automatically when the app starts.
CMD ["node", "dist/main.js"]
