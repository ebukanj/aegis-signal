# 18 — Operations, Deployment & Runbook

> **Measure the Market. Protect the Trader.** — This document is the other half of
> that promise: the platform is only protective if it stays up, stays honest, and
> can be recovered when it doesn't. This is how it is deployed, watched, and repaired.

Everything here is real and shippable. Where a step depends on infrastructure this
repository cannot contain (a VPS, a Cloudflare account, a Prometheus server), the
procedure is written out fully so it can be followed on that infrastructure — it is
documented, not faked.

---

## 1. Topology

```
                 ┌────────────┐
   Traders ─────►│ Cloudflare │  TLS, DDoS, WAF, caching of static assets
                 └─────┬──────┘
                       │
                 ┌─────▼──────┐
                 │   nginx    │  deploy/nginx.conf — reverse proxy
                 └──┬──────┬──┘
          /  , RSC │      │ /api , /socket.io
             ┌─────▼──┐ ┌─▼───────────┐
             │  web   │ │     api      │  NestJS (this repo, apps/api)
             │Next.js │ │  :4000       │
             └────────┘ └──┬────────┬──┘
                           │        │
                     ┌─────▼──┐ ┌───▼─────┐
                     │Postgres│ │  Redis  │  (BullMQ jobs + cache)
                     └────────┘ └─────────┘
```

- **The API is the only thing that decides.** The web app renders; nginx routes;
  Cloudflare protects. None of them make a trading decision.
- **`/metrics` and `/health` never reach the public internet.** nginx returns 404 for
  both from the edge; Prometheus scrapes `/metrics` over the private network and
  Coolify hits `/health` on the container directly.

---

## 2. Deploying (Coolify on a Hostinger VPS)

We deploy with **Docker → Coolify**, never Vercel/Railway (AGENTS.md §7). Coolify
injects the environment; it does **not** read `docker-compose.yml`.

### 2.1 First deploy

1. Provision the VPS; install Coolify; point a Cloudflare-proxied domain at it.
2. Create a Postgres resource and a Redis resource (or use managed ones). Redis must
   be `--appendonly yes` — BullMQ's jobs live there, and a job lost on restart might
   be the risk check that should have blocked a trade.
3. Create the API application from this repo, Dockerfile `apps/api/Dockerfile`.
4. Set the environment (see §3). **`ADMIN_API_TOKEN` is required** — the app refuses
   to boot in production without a strong one.
5. Set the **release command** to run migrations before the new container takes
   traffic (§4). Deploy.
6. Create the web application (`apps/web`), set `NEXT_PUBLIC_API_URL` to the API's
   public URL, deploy.
7. Put `deploy/nginx.conf` in front (or configure Coolify's proxy equivalently).

### 2.2 Every subsequent deploy

Coolify rebuilds the image, runs the release command (migrations), starts the new
container, waits for its `HEALTHCHECK` to pass, then drains and stops the old one.
Nest's shutdown hooks make the drain graceful — in-flight requests finish, the Prisma
pool closes cleanly. **Zero-downtime depends on the healthcheck being honest**, which
is why `/health` round-trips real queries rather than returning `{ok:true}`.

---

## 3. Environment

The full list with commentary is `apps/api/.env.example`. The environment is
validated at boot (`env.schema.ts`); an invalid one **kills the process immediately**
rather than failing later under load. Production tightens the screws — it refuses a
placeholder `JWT_SECRET`, a `localhost` `APP_URL`, and an unset/short
`ADMIN_API_TOKEN`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://…` |
| `REDIS_URL` | yes | `redis://…`; appendonly on the server |
| `JWT_SECRET` | yes | 32+ chars, no placeholder words in prod |
| `ADMIN_API_TOKEN` | **yes in prod** | 24+ chars; gates the admin API. `openssl rand -base64 32` |
| `APP_URL` / `WEB_ORIGIN` | yes | public URLs; CORS is an allow-list, never `*` |
| `GIT_COMMIT` | optional | stamped into `/health/info` + admin build panel |
| `HTTP_BODY_LIMIT` | optional | default `256kb` |
| `HTTP_REQUEST_TIMEOUT_MS` | optional | default `30000` |

Secrets are never returned by any endpoint. `/health/info` and the admin build panel
report the commit and environment, never a connection string or a token.

---

## 4. Database migrations

Migrations run as a **release command**, before the new container serves traffic:

```bash
pnpm --filter @aegis/api exec prisma migrate deploy
```

Never `migrate dev` in production (it can create/reset). `migrate deploy` only applies
already-committed migrations. Running it as a release step — not at container start —
keeps it correct when more than one replica boots at once.

---

## 5. Observability

### 5.1 Health

- `GET /health` — liveness + dependencies (Postgres, Redis, queue, exchanges). Reports
  `down` only when a dependency truly is. Exchanges report down only when **every**
  exchange is unreachable; one exchange having a bad afternoon must not pull the
  container from rotation.
- `GET /health/info` — build, version, commit, environment, timezone, uptime.
- **Admin `GET /api/v1/admin/overview`** — the deep view: system health (memory, CPU,
  event-loop lag, UTC clock), every module's own metrics, queue depths, exchange
  health, feature flags, maintenance state. Token-guarded.

The system-health thresholds:

| Check | WARNING | CRITICAL |
|---|---|---|
| System memory used | ≥ 85% | ≥ 95% |
| Event-loop mean lag | ≥ 50ms | ≥ 200ms |
| CPU load (per core) | ≥ 80% | ≥ 100% |
| Clock | — | not UTC |

The clock check is CRITICAL-only and deliberately so: this platform buckets candles
and stamps signals by time, and a non-UTC server mis-buckets — a wrong indicator, not
just a wrong log line.

### 5.2 Metrics (Prometheus)

`GET /metrics` (internal network only) exposes process gauges (RSS, heap, uptime),
HTTP counters (`http_requests_total` by method/status class, `http_errors_total`), and
`aegis_*` business gauges lifted from each module's `metrics()`. A minimal scrape:

```yaml
scrape_configs:
  - job_name: aegis-api
    metrics_path: /metrics
    static_configs:
      - targets: ["api.internal:4000"]
```

Alerts worth wiring first: event-loop lag CRITICAL, 5xx rate climbing, a queue's
`failed`/`waiting` growing without bound, all exchanges disconnected.

### 5.3 Logs

Structured JSON via Pino — no `console.log` anywhere. A request/trace id propagates
through the error envelope (`{error:{code,message,requestId,timestamp}}`) and the
logs, so one failed request is greppable end to end. Full OpenTelemetry export is
ready-to-wire (the id already propagates) but not shipped — it needs a collector.

---

## 6. Operating the platform (the levers)

All of these are in the **admin console** (`/admin`) and over the admin API. Every
change is **audited** (append-only, immutable) with the actor and a before/after.

### 6.1 Feature flags — the kill switches

`POST /api/v1/admin/flags/:key` `{ "enabled": false }`. Effect is immediate, no deploy.
The four that ship:

| Flag | Turning it off… |
|---|---|
| `signals.publish` | stops new signals being published |
| `notifications.deliver` | stops notification delivery |
| `insights.collect` | pauses news/insight collection |
| `ledger.settle` | pauses outcome settlement |

Rollout percentage is deterministic (a stable hash of the subject), so a partial
rollout is consistent per subject, not a coin flip per request. An **unknown flag is
OFF** — fail closed.

### 6.2 Maintenance mode

`POST /api/v1/admin/maintenance` `{ "enabled": true, "message": "back at 04:00 UTC" }`.
Public requests get a clean **503** with the message; health, `/metrics` and the admin
API stay reachable so you can lift it. `"readOnly": true` is the softer variant —
reads flow, writes are turned away — for running a migration or backfill live.

---

## 7. Runbook — when things go wrong

**Symptom → first move.** Confirm with `/api/v1/admin/overview` before acting.

| Symptom | Likely cause | Action |
|---|---|---|
| Health `down`, DB check red | Postgres unreachable | Check the DB resource; the API retries the pool. Do not restart in a loop — fix the DB. |
| Health `down`, redis red | Redis unreachable / evicting | Confirm `noeviction` policy and appendonly; BullMQ blocks on Redis by design. |
| Event-loop lag CRITICAL | a hot path is blocking | Check recent deploys; scale the container; flip the offending feature flag off. |
| All exchanges disconnected | upstream/network | Nothing to publish is correct behaviour, not a bug — do not fake data. Check egress/DNS. |
| A queue's `failed` climbing | a worker throwing | Inspect the dead-letter queue; failed jobs are kept on purpose. Fix, then retry. |
| Signals feed empty | no live setups **or** `signals.publish` off | Check the flag first; an empty feed is often the honest truth. |
| Admin API 403 in prod | `ADMIN_API_TOKEN` unset/wrong | Set it; the app fails closed by design. |
| Bad deploy | any | Coolify → redeploy the previous image. The old image + `migrate deploy` (additive) makes rollback safe. |

**Emergency stop:** flip the relevant kill-switch flag (§6.1). It is faster than a
deploy and it is audited. For a full stop, enable maintenance mode.

---

## 8. Backup & recovery

- **Postgres is the source of truth** (the ledger is immutable and append-only — it is
  the platform's memory). Schedule daily `pg_dump` + point-in-time recovery (WAL
  archiving) on the DB host or via the managed provider. Test a restore quarterly; a
  backup you have never restored is a hope, not a backup.
- **Redis** holds jobs and cache, not truth. Appendonly gives crash recovery; losing
  Redis loses in-flight jobs, not history. The ledger backfill reconciles signals into
  the ledger on boot, so a cold Redis recovers to a correct state.
- **Recovery drill:** restore the latest DB snapshot to a fresh instance, point a
  staging API at it, confirm `/health` and `/api/v1/admin/overview` are green.

---

## 9. Known honest limits (v1.0)

- **No user/auth system yet.** Admin is gated by a shared token as the interim
  boundary; roles, sessions and per-user preferences arrive with the Users milestone.
  The admin console's user/role/strategy/worker tabs are labelled placeholders.
- **Load testing** methodology is documented; a real 10k-user test needs infrastructure
  outside this repo.
- **OpenTelemetry** export and a Prometheus/Grafana stack are ready-to-wire, not
  bundled — they need a collector/server this repo does not host.
