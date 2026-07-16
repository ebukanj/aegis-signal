# Deploying Aegis Signal on Coolify (Hostinger VPS)

> Adding Aegis Signal as a **second project** to an existing Coolify instance.
> Four resources: Postgres, Redis, the API, the Web app. GitHub → auto-deploy.
> Roughly 30 minutes the first time.

Everything below assumes your Coolify dashboard is reachable and your first
project already works (so the server, Docker and proxy are known-good).

---

## 0. What you will end up with

| Resource | Type | Where it comes from |
|---|---|---|
| `aegis-postgres` | PostgreSQL 16 | Coolify one-click database |
| `aegis-redis` | Redis 7 | Coolify one-click database |
| `aegis-api` | Dockerfile app | this repo → `apps/api/Dockerfile` |
| `aegis-web` | Dockerfile app | this repo → `apps/web/Dockerfile` |

Two domains (via Cloudflare DNS → your VPS IP):

- `app.yourdomain.com` → the web app
- `api.yourdomain.com` → the API

The API image **runs its own database migrations on every start**
(`prisma migrate deploy`) — there is no manual migration step, ever.

---

## 1. Create the project

Coolify → **Projects → + Add** → name it `aegis-signal`. Everything below goes
inside this project so it stays cleanly separated from your first one.

## 2. Databases (one-click, 2 minutes)

1. **+ New → Database → PostgreSQL** (v16). Name: `aegis-postgres`.
   After it starts, open it and copy the **internal connection URL** — it looks
   like `postgres://postgres:<password>@aegis-postgres:5432/postgres`.
2. **+ New → Database → Redis** (v7). Name: `aegis-redis`.
   Copy its internal URL: `redis://default:<password>@aegis-redis:6379`.

> Internal URLs only work between resources in the same Coolify network —
> which is exactly what we want. Nothing needs a public database port.
> You can retire the cloud Redis you used in development; a local Redis on the
> same box is faster and has no connection cap.

## 3. The API

**+ New → Application → Public/Private Repository** →
`https://github.com/ebukanj/aegis-signal` , branch `main`.

- **Build pack:** Dockerfile
- **Dockerfile location:** `apps/api/Dockerfile`
- **Base directory:** `/` (the repo root — the Dockerfile needs the whole
  monorepo; do NOT set it to `apps/api`)
- **Port:** `4000`
- **Domain:** `api.yourdomain.com`
- **Health check** (optional; the image has its own): path `/health`, port 4000.

### Environment variables (runtime)

```dotenv
NODE_ENV=production
PORT=4000
TZ=UTC

# From step 2 — change the database name if you created a dedicated one
DATABASE_URL=postgresql://postgres:<password>@aegis-postgres:5432/postgres
REDIS_URL=redis://default:<password>@aegis-redis:6379

# Identity — generate a real one:  openssl rand -hex 32
JWT_SECRET=<64 hex chars, generated, never a word>
JWT_EXPIRES=7d

# CORS — the web app's public origin
WEB_ORIGIN=https://app.yourdomain.com
APP_URL=https://api.yourdomain.com

# Operator token for headless admin access (curl/CI). Signed-in ADMINs don't need it.
ADMIN_API_TOKEN=<openssl rand -hex 24>

# Telegram (from @BotFather — same values as local)
TELEGRAM_BOT_TOKEN=<your bot token>
TELEGRAM_BOT_USERNAME=Njirikabot

# Optional — full economic calendar (financialmodelingprep.com free tier)
# ECONOMIC_CALENDAR_API_KEY=

# ── DO NOT SET on the VPS ──
# EXCHANGE_DNS_SERVERS   ← dev-only escape hatch for ISP DNS filtering.
#                          A VPS resolves exchanges normally; setting this is
#                          an outage scheduled by someone else's DNS.
```

Deploy. First build takes a few minutes (pnpm install + compile). Watch the
logs for, in order: `prisma migrate deploy` applying the migrations, then
`Aegis Signal API is listening`, then `Live scan armed`.

## 4. The Web app

**+ New → Application** → same repository, branch `main`.

- **Build pack:** Dockerfile
- **Dockerfile location:** `apps/web/Dockerfile`
- **Base directory:** `/`
- **Port:** `3000`
- **Domain:** `app.yourdomain.com`

### Build variables (NOT runtime — these are baked into the browser bundle)

```dotenv
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

> In Coolify, add this under the application's **build-time** variables (it is
> passed as a Docker build ARG). If you ever change the API domain you must
> **rebuild** the web app, not just restart it.

Deploy.

## 5. Cloudflare DNS

Two **A records** pointing at the VPS IP: `app` and `api`. Two gotchas:

- **WebSockets:** the platform streams live prices and notifications over
  Socket.IO. Cloudflare proxies WebSockets fine on default settings — just
  don't enable Rocket Loader on these hosts.
- **SSL mode:** set Cloudflare SSL to **Full (strict)** once Coolify has issued
  Let's Encrypt certificates (it does this automatically when the domain
  resolves). "Flexible" mode causes redirect loops.

## 6. First-run checklist (5 minutes)

1. `https://api.yourdomain.com/health` → `200`.
2. Open `https://app.yourdomain.com` → you land on **/login**.
3. **Register — the first account becomes the platform ADMIN.** Do this before
   sharing the URL with anyone.
4. Settings → Integrations → **Connect Telegram** → press Start in Telegram.
5. Administration → Platform Health: on the VPS, Core API and WebSockets should
   sit **HEALTHY** (the local flapping was your ISP muting Binance's stream and
   a laptop CPU — the VPS has neither problem).
6. Watch the API logs for the first sweep:
   `Scan: N pairs checked · N passed · Nms` and, on quiet sweeps,
   `Why nothing passed: …` — the platform explains its silences.

## 7. Auto-deploy

Coolify → each application → **Webhooks** → enable the GitHub webhook (Coolify
gives you the URL; add it under the repo's Settings → Webhooks). From then on
every push to `main` rebuilds and redeploys. Migrations run automatically on
boot; a failed migration stops the container **before** it serves traffic —
fail closed, by design.

## 8. Operational notes

- **One API instance.** The scan worker, settlement worker and Telegram poller
  are in-process singletons; horizontal scaling needs a leader-election story
  that does not exist yet. One instance is plenty.
- **Backups:** enable Coolify's scheduled backups on `aegis-postgres`. The
  ledger is the platform's permanent memory — it is the one thing you cannot
  regenerate.
- **Resources:** the API is happiest with ~1 GB RAM headroom; sweeps are
  CPU-bursty but yield. The web app is tiny (standalone Next server).
- **nginx.conf in `deploy/`** is for a manual-nginx setup and is NOT needed
  under Coolify — Coolify's proxy (Traefik/Caddy) handles TLS and WebSocket
  upgrades itself.
