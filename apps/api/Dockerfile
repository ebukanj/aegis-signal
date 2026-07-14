# Aegis Signal API — production image.
#
# Multi-stage. Runs as non-root. Health-checked. Graceful shutdown via Nest's
# shutdown hooks — Coolify restarts this on every deploy, so stopping cleanly is
# something that happens several times a week, not a theoretical nicety.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY . .

# The contract is a build input, not a runtime dependency to discover late.
RUN pnpm --filter @aegis/contracts build
RUN pnpm --filter @aegis/api exec prisma generate
RUN pnpm --filter @aegis/api build

# Production dependency tree only — dev tooling has no business in a prod image.
RUN pnpm --filter @aegis/api --prod deploy /app/pruned

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# dumb-init reaps zombies and forwards SIGTERM — without it, PID 1 is Node and
# Node does not forward signals, so the container is killed rather than stopped.
RUN apk add --no-cache dumb-init \
  && addgroup -S aegis \
  && adduser -S aegis -G aegis

COPY --from=build --chown=aegis:aegis /app/pruned/node_modules ./node_modules
COPY --from=build --chown=aegis:aegis /app/apps/api/dist ./dist
COPY --from=build --chown=aegis:aegis /app/apps/api/prisma ./prisma

USER aegis

# PORT is injected by Coolify. Never hard-code it.
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
