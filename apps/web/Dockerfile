# Aegis Signal Web — production image.
#
# Multi-stage, non-root, standalone Next output. One thing to know before
# touching this file: NEXT_PUBLIC_* variables are baked into the BROWSER BUNDLE
# at build time — they are build ARGs here, not runtime env. Changing the API
# URL means rebuilding the image, not restarting it. Coolify passes them as
# build variables.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS build

# Baked into the client bundle. Set these in Coolify's BUILD variables.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY . .

# The contract is a build input for the web exactly as it is for the API.
RUN pnpm --filter @aegis/contracts build
RUN pnpm --filter @aegis/web build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache dumb-init \
  && addgroup -S aegis \
  && adduser -S aegis -G aegis

# Standalone output is self-contained: server.js + the traced node_modules.
# Static assets and public/ are served by the same server and copied alongside.
COPY --from=build --chown=aegis:aegis /app/apps/web/.next/standalone ./
COPY --from=build --chown=aegis:aegis /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=aegis:aegis /app/apps/web/public ./apps/web/public

USER aegis

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
