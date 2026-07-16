# Milestone 14 — Administration, Observability & Production Hardening — Checklist

`[x]` done · `[~]` in progress · `[ ]` not started. **No new business features** —
everything from M01–13 becomes observable, secure, reliable, deployable.

Much of the foundation already exists: Terminus `/health`, Pino structured logs,
`@nestjs/throttler` rate limiting, Helmet + compression + CORS + URI versioning,
a global exception filter with `{code, message, requestId, timestamp}`, config
validation that refuses to boot on bad env, graceful shutdown hooks.

---

## Backend — admin & observability

- [x] **Prisma** — `AdminAudit` (immutable) + `AdminSetting` (feature flags +
      maintenance state) + migrate. _(migration `20260715183614_admin_observability`)_
- [x] **Audit service** — every admin action appended, immutable, never overwritten.
      Surface is `record` + `recent` only; no update, no delete.
- [x] **Feature flags** — runtime enable/disable + kill switch + percentage rollout
      (deterministic FNV bucketing), persisted, audited, hot in-memory read; an
      unknown flag is OFF (fail closed). No deploy needed.
- [x] **Maintenance mode** — enable/disable with message + read-only variant; a global
      guard returns 503 gracefully; health, `/metrics` and the admin API always pass.
- [x] **Admin module + secured controller** — `AdminService.overview()` aggregates
      status across modules via their public `metrics()`/`health()` (signals,
      confidence, ledger, insights, notifications), plus system health, queue depths,
      exchange health, flags, maintenance, build/version. Each read is fault-isolated.
- [x] **Admin guard** — `ADMIN_API_TOKEN` (constant-time compare) gates the whole admin
      controller; dev-open, prod-closed (and boot refuses prod without a 24+ char
      token). Actor recorded from token bearer + IP.
- [x] **Prometheus `/metrics`** — process (RSS, heap, uptime) + HTTP counters + app
      business gauges, hand-rolled Prometheus text format (no new dependency).
- [x] **Extended health** — `SystemHealthService`: memory, CPU load, event-loop lag,
      and a UTC-clock check → HEALTHY / WARNING / CRITICAL.
- [x] **Security** — request timeout (30s, health/metrics exempt) + 256kb JSON payload
      limit in bootstrap; throttler already global; secrets never returned.

## Deployment (files, not a live deploy)

- [x] **Dockerfile** (multi-stage, non-root, dumb-init, healthcheck — pre-existing,
      verified), **docker-compose.yml** (+ ADMIN_API_TOKEN), **deploy/nginx.conf**
      (WebSocket upgrade, `/metrics` + `/health` never public, body limit),
      **.dockerignore** (root — the build context). Graceful shutdown via Nest hooks.

## Frontend (app stays live)

- [x] **Wire the Admin page** to the real `/admin/*` APIs — dashboard, platform health,
      exchanges, queues, feature flags (interactive toggles), audit log, and
      maintenance mode (interactive) are LIVE (`admin-api.ts` + `use-admin.ts` +
      `adapters.ts`). Users, roles, strategy admin, workers, providers, historical
      monitoring and system logs remain honest placeholders behind a `NotLiveBanner`
      ("arrives with a later milestone"). The console is token-guarded (dev-open).

## Close-out

- [x] **Production checklist** — wired admin surfaces carry no mock data; no debug
      routes; Pino only (no console.log); admin/metrics/health never leak secrets.
- [x] Tests — `admin.spec.ts` (18): feature flags (fail-closed, kill switch, rollout
      determinism, persistence), maintenance, audit immutability, admin guard, the
      maintenance guard, system-health thresholds, Prometheus exposition. Plus an env
      test that prod refuses an unguarded admin surface.
- [x] docs/18-OPERATIONS.md (runbook + deployment + recovery + monitoring). AGENTS.
      Full suite green. Verify live. Commit. **This is v1.0 — STOP.**

---

### Honest scope notes

- **No auth/user system yet** — JWT rotation, refresh tokens, session/device
  tracking, roles are architecture-only and documented, not built. The admin guard
  uses a shared admin token as the interim boundary.
- **OpenTelemetry** — a trace/request id already propagates through the error
  envelope and logs; a full OTel exporter is documented as ready-to-wire, not
  shipped (heavy dep, needs a collector).
- **Load testing** — methodology + any local benchmarks documented; a real 10k-user
  test needs infrastructure this environment does not have.
- **Backups / Coolify / Cloudflare** — documented procedures + config; the actual
  scheduled backups and cloud deploy happen on the VPS, not from here.
