# AGENTS.md — The Aegis Signal Constitution

**Project:** Aegis Signal — Crypto Market Intelligence Platform
**Status:** Authoritative
**Applies to:** every contributor, human or AI.

> This file is the **single source of truth** for how Aegis Signal is built.
> It is the one document you must read. It settles every conflict, and it
> declares who owns every other decision.
>
> If this document contradicts any other document, **this document wins** —
> and the other document is a defect that must be fixed in the same change.

---

## 1. The One Thing

Aegis Signal exists to do exactly one thing:

> **Tell the trader: here is a trade worth taking right now, here is exactly
> how to take it, here is why, and here is what proves it wrong — and say
> nothing at all when no such trade exists.**

The single output of this platform is **the Signal**: a deterministic,
risk-validated, explainable, executable trade instruction. Roughly **4–5 Prime
signals per day** ([ADR-021](docs/adr/ADR-021-confluence-prime-signals-execution-guidance.md)).

Everything else — the scanner, the dashboard, analytics, backtesting, paper
trading, the AI layer, notifications, the admin console — exists for one
reason only: **to make that single output trustworthy enough to act on.**

**Silence is a feature.** A day with zero signals is a *successful* day if the
rules produced zero. The Risk Engine's authority to kill a signal the
strategies liked is not an obstacle to the product — it *is* the product.
"Protect the Trader" is the half that earns the trust that makes "Measure the
Market" worth anything.

### The feature test
Before building anything, answer this:

> **Does this make the trade instruction more trustworthy, or does it just add
> surface area?**

If it only adds surface area, do not build it.

---

## 2. Ownership Map — One Owner Per Concept

There is no global "source of truth" for *content*. There is **one authoritative
owner per concept**, and this table is the authority that assigns them. Never
duplicate a concept across two owners. If you need to know something, go to its
owner — do not re-derive it, and do not copy it.

| Concept | Single Owner | Everyone else must |
|---|---|---|
| **Why the platform exists / what a feature must earn** | This file, §1 | obey |
| **How agents work, what "done" means, conflict resolution** | This file | obey |
| **Product identity, philosophy, pillars** | [docs/01-PRODUCT_BIBLE.md](docs/01-PRODUCT_BIBLE.md) | cite |
| **Non-negotiable principles (tiebreaker for values)** | [docs/02-FOUNDING_PRINCIPLES.md](docs/02-FOUNDING_PRINCIPLES.md) | obey |
| **Engineering standards, Clean Architecture, DDD** | [docs/03-ENGINEERING_PHILOSOPHY.md](docs/03-ENGINEERING_PHILOSOPHY.md) | obey |
| **Functional requirements, scope, roadmap** | [docs/04-PROJECT_PRD.md](docs/04-PROJECT_PRD.md) | cite |
| **System design, modules, event flow** | [docs/05-SOLUTION_ARCHITECTURE.md](docs/05-SOLUTION_ARCHITECTURE.md) | cite |
| **The strategy model + the 5 built-in strategies** | [docs/06-STRATEGIES.md](docs/06-STRATEGIES.md) | implement, never invent |
| **The `StrategyDefinition` schema (a strategy is a *document*)** | `packages/contracts/src/strategy.ts` | one evaluator reads it — never write a bespoke plugin |
| **Architecture *decisions* and their rationale** | [docs/adr/](docs/adr/) | never silently reverse |
| **UI tokens, spacing, color, component rules** | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | obey |
| **API contract / DTO shapes / domain enums** | `packages/contracts` (code) | import, never redeclare |
| **Database schema** | `packages/database/prisma/schema.prisma` (code) | migrate, never hand-edit tables |
| **Trade validation, `marketType`, `suggestedLeverage`, position sizing** | **The Risk Engine** (code) | consume its output, never compute your own |
| **Confidence scores** | Confidence Engine, calibrated against the ledger | display, never fabricate |
| **What the backend must build, and must never do** | [docs/07-BACKEND_REQUIREMENTS.md](docs/07-BACKEND_REQUIREMENTS.md) | implement; append when frontend work creates an obligation |

**Conflict rule:** when two sources disagree, the owner in this table wins.
When the *ownership itself* is unclear, **this file wins**, and you must update
this table in the same change.

---

## 3. Required Reading Order

Read in this order. Never skip the sequence.

1. **AGENTS.md** (this file) — the constitution
2. [docs/01-PRODUCT_BIBLE.md](docs/01-PRODUCT_BIBLE.md) — what we are building
3. [docs/02-FOUNDING_PRINCIPLES.md](docs/02-FOUNDING_PRINCIPLES.md) — what we will not compromise
4. [docs/03-ENGINEERING_PHILOSOPHY.md](docs/03-ENGINEERING_PHILOSOPHY.md) — how we build
5. [docs/04-PROJECT_PRD.md](docs/04-PROJECT_PRD.md) — what it must do
6. [docs/05-SOLUTION_ARCHITECTURE.md](docs/05-SOLUTION_ARCHITECTURE.md) — how it fits together
7. [docs/06-STRATEGIES.md](docs/06-STRATEGIES.md) — the trading logic
8. [docs/07-BACKEND_REQUIREMENTS.md](docs/07-BACKEND_REQUIREMENTS.md) — what `apps/api` must build, and must never do
9. [docs/adr/](docs/adr/) — decisions already made (read before proposing a new one)

---

## 4. Current Reality — Read This Before You Believe Any Doc

The docs describe the **target** system. This section describes the **actual**
system. Keep it accurate; a stale reality section is a defect.

| Area | Status |
|---|---|
| `apps/web` | **Built and polished, running on LIVE backend data.** Next.js 15. Signals, signal detail, confidence, live price, Track Record, Insights (news + risk flags), Notifications and most of the Admin console read the real API over HTTP + Socket.IO; remaining mocks are the surfaces whose backend does not exist yet (Scanner, Settings, and the auth-dependent Admin tabs), each labelled honestly. Zero lint errors, strict TypeScript, build green. Seven workspaces: Signals · Scanner · Strategies · Insights · Track Record · Notifications · Settings (+ Admin). |
| `packages/contracts` | **Built and tested.** 87 tests. **Owns the six strategy documents** — one copy, imported by both apps. The one definition of every DTO, domain enum, indicator, pattern and invariant. |
| Strategies | **Six plain-English documents**, not code ([ADR-023](docs/adr/ADR-023-strategy-as-document.md)). Vocabulary covers 47 indicators, divergence, market structure and chart patterns ([ADR-024](docs/adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)). **None is implemented or validated. All are UNPROVEN.** |
| `apps/api` | **Built through Milestone 14 — v1.0.** 654 tests. NestJS, Prisma, Redis, BullMQ, Pino, Terminus. `/health` checks database, redis, queue **and exchange connectivity**; `/health/info` reports build/commit; `/metrics` exposes Prometheus text; `/api/v1/admin/*` is the token-guarded operator console. Bootstrap hardened (256kb body limit, 30s request timeout, helmet, CORS allow-list, throttler). |
| `packages/database` | **Built.** Prisma schema + local Postgres (`aegis_signal`). |
| **Market Data & Exchange Layer** | **BUILT AND LIVE.** Real Binance + Bybit data. CCXT REST, native Binance WebSocket, symbol registry, circuit breaker, rate limiter, boundary normalizer, Redis cache, Socket.IO gateway. **Real candles and real prices flow end to end.** |
| **Indicator Engine** | **BUILT.** All 47 contract indicators, cross-checked against an independent library and verified on live BTC candles. Registry, multi-timeframe resolver, Redis cache, validation gate, 16 operators, divergence engine, benchmark suite. See [docs/08-INDICATORS.md](docs/08-INDICATORS.md). |
| **Pattern Engine** | **BUILT.** 24 detectors: swings, market structure (BOS/CHoCH), zones, liquidity sweeps, FVGs, order blocks, flags, wedges, triangles, channels, double/triple tops. Every detection carries evidence AND weaknesses. Guarded by a false-positive suite over random walks. **Head & shoulders, cup & handle and Elliott waves remain REFUSED** (ADR-024) — see [docs/09-PATTERNS.md](docs/09-PATTERNS.md). |
| **Market Regime Engine** | **BUILT.** Two orthogonal axes (direction + volatility), a five-voter weighted vote with signed scores, hysteresis with a dwell, multi-timeframe alignment/conflict, and strategy compatibility **declared on the strategy document** (ADR-023). Replayed against real BTC history: 2021 bull, 2022 bear, mid-2020 chop, COVID crash. `agreement` is stamped **UNCALIBRATED** forever — there is no ground truth for a regime, so a regime "probability" is unfalsifiable by construction. See [docs/10-REGIME.md](docs/10-REGIME.md). |
| **Strategy Evaluator** | **BUILT.** One generic document interpreter — **zero strategy-specific code, proven by a test that greps the module's own source**. Entry language: ALL-OF of [rule \| ANY-OF group], with NOT. Versioning: editing a rule bumps the version and **wipes the track record** (ADR-024). Produces CANDIDATES — no confidence, no approval, no risk validation. Verified on live BTC. See [docs/11-STRATEGY-EVALUATOR.md](docs/11-STRATEGY-EVALUATOR.md). |
| **Risk Engine (The Veto)** | **BUILT.** 14 gates, every limit externalised in `risk.policy.ts` and checked for self-contradiction at boot. Sizes from the **stop**, never the leverage; walks leverage down until **liquidation clears the stop by 1.5R**, and vetoes if no level is safe. A feed that was never built (news, ledger, funding) reads **UNASSESSED and is named to the trader**; a feed that *should* be there and is dark **vetoes**. Verified on live BTC: a sane trade approved, four bad ones refused with the measurement. See [docs/12-RISK-ENGINE.md](docs/12-RISK-ENGINE.md). |
| **Confidence & Calibration Engine** | **BUILT.** The trust layer. Kills the fabricated `randInt(52,92)+4` score for good. The **score** is named contributors with stated weights — real evidence, day one; the **probability** is earned only from outcomes. A background **replay** walks 2 years of real Binance history through the *same* evaluator, risk veto and score builder (no reimplementation), labels each setup (target-before-stop = WIN; a bar touching both = LOSS; neither = EXPIRED, a non-win), and fits **three** calibrators (shrinkage / Platt / isotonic) — shipping whichever has the best **out-of-sample** ECE. **Beta shrinkage** stops three lucky setups becoming a 100% win rate; **history and live are never merged** behind one number; every model is **versioned and never overwritten**. Prime stays barred (UNPROVEN, ADR-023 §4). See [docs/13-CONFIDENCE.md](docs/13-CONFIDENCE.md). |
| **Signal Engine (The Publisher)** | **BUILT.** The Editor-in-Chief. Orchestrates only — recomputes nothing. **Confluence** (agreement, computed here from already-computed evidence) is kept strictly separate from **confidence** (probability, from M09); ≥2 independent strategies agreeing are **fused into one signal** crediting all (ADR-021 §1), with zero confidence uplift until the ledger prices it. Deterministic ids → idempotency, dedup and reproducible replay. Freshness (a signal never outlives its conditions), a ranked **Prime budget** with per-symbol/strategy/hour caps, and an append-only lifecycle whose terminal states cannot be left. **Prime awards 0 today** — nothing is live-proven (ADR-023 §4), and that is correct, not a fault. Verified end-to-end against Postgres. See [docs/14-SIGNAL-ENGINE.md](docs/14-SIGNAL-ENGINE.md). |
| **Outcome Ledger & Track Record** | **BUILT.** The permanent memory. Records every published signal immutably; **settlement is one-way and once** (a re-settle is refused and appended as a CORRECTION, never overwritten). Outcomes are computed from PRICE, never asserted — deterministic, and pessimistic on the one-bar-touched-both ambiguity (matches the M09 labeller). Settles R / PnL% / **MFE / MAE** / duration / exit reason. Track record states its own **basis** (NO_DATA / PROVISIONAL / ESTABLISHED) so a small sample can't pose as a record. A **Settlement Worker** monitors live price and settles resolved signals → the feed drops them live over the `signals` socket (**no refresh** — the owner's requirement). First real record: 48 settled, 29.2% win rate, −0.27R expectancy — Breakout loses money as written, recorded plainly. See [docs/15-LEDGER.md](docs/15-LEDGER.md). |
| **Insights Engine (News & Context)** | **BUILT.** The eyes and ears. Collects real crypto news (Cointelegraph, Decrypt, CoinDesk, Bitcoin Magazine RSS), normalizes to one canonical shape, classifies **deterministically** (rules you can read — no AI, no price prediction), deduplicates so a story counts once, and derives **Risk Flags** only from *corroborated* danger (2+ sources on a named coin). Context, never a decision: it never creates/rejects/modifies a signal — its one power is a veto (ADR-023 §5). Social/on-chain/AI-summary are architecture-only (empty, labelled, never faked). Verified live: 99 real news in 2.3s, 4 healthy feeds. See [docs/16-INSIGHTS.md](docs/16-INSIGHTS.md). |
| **Notification Engine** | **BUILT.** The last mile — delivers events, decides nothing. Right event → right user → right channel → right time → **exactly once** (deterministic delivery id + dedup window) → fully observable (QUEUED→SENDING→DELIVERED/RETRYING/FAILED/SUPPRESSED/CANCELLED). Every provider hides behind one interface: **IN_APP is live** (WebSocket toast in the browser); Telegram/WhatsApp/Email/Push are wired provider interfaces that decline cleanly until a credential lands. Preferences only ever REMOVE a delivery (priority/quiet-hours/watchlist/confidence); retries back off and dead-letter; deterministic templates, never AI. See [docs/17-NOTIFICATIONS.md](docs/17-NOTIFICATIONS.md). |
| **Administration & Observability** | **BUILT (v1.0).** Sits ABOVE the pipeline and only observes it — it borrows each module's own `metrics()`/`health()`, never recomputes a score. `/api/v1/admin/overview` is the whole platform on one screen (system health: memory/CPU/**event-loop lag**/**UTC clock**; per-module metrics; queue depths; exchange health; flags; maintenance; build) with every section **fault-isolated**. **Feature flags** are runtime kill switches + deterministic rollout, persisted and **audited**, an unknown flag is OFF (fail closed). **Maintenance mode** returns a graceful 503 (health/metrics/admin always pass; read-only variant). **Audit** is append-only and immutable. **Admin guard** = `ADMIN_API_TOKEN` constant-time compare, dev-open / prod-closed (boot refuses prod without it). **`/metrics`** is hand-rolled Prometheus (no new dep), internal-network only. Deployment: multi-stage Dockerfile, compose, `deploy/nginx.conf` (WS upgrade; metrics/health never public), root `.dockerignore`. See [docs/18-OPERATIONS.md](docs/18-OPERATIONS.md). |
| AI layer | **Not built.** |

### What the frontend still fakes, and must stop faking

The owner's standing directive (M10): **the app must run on live backend data — no
mock data.** As each engine lands, its surface is wired to the real API and the
mock is deleted in the same change (the [MOCK_RETIREMENT](docs/MOCK_RETIREMENT.md)
rule — delete, never adapt).

**Still on mock, because their backends do not exist yet:**

1. **Scanner** — no scan endpoint yet (`mock-opportunities.ts`).
2. **Insights** — News + risk flags are LIVE (M12). Social/fundamentals show an honest "not live yet" state (architecture-only).
3. **Settings** — later (Users) milestone. **Admin is now PARTLY LIVE (M14):** dashboard, platform health, exchanges, queues, feature flags (interactive), audit log and maintenance mode read the real `/admin/*` API; users/roles/strategy-admin/workers/providers/monitoring/system-logs stay honest placeholders behind a `NotLiveBanner`. Notifications LIVE (M13).

Each retires when its milestone ships. Prefer an **honest empty state** over
invented content — silence is a feature (§1).

4. **Sizing and the safe-leverage cap.** `position-calculator.tsx` re-derives
   position size, liquidation price and the highest safe leverage **in the
   browser**. That arithmetic has an owner — the Risk Engine — and two
   implementations of a liquidation formula is one too many. The what-if sliders
   may stay; **the numbers must come from the decision**.

### What is no longer faked

**The live price is real.** It streams from Binance, through the market module,
over the Socket.IO gateway, into `useLivePrice`. The seeded random walk that used
to power it is **deleted**. When no price has arrived, the UI says
"Waiting for price…" rather than inventing a plausible one.

**Signals are real (M09–M10).** The Signals feed and detail render the platform's
actual published signals from `GET /api/v1/signals/*` — real strategy evaluation,
real risk approval, real calibrated confidence. `mock-today`, `mock-signal-details`
and `mock-confidence` are **deleted**. The feed is **live**: it subscribes to the
`signals` socket and refetches when a signal settles or publishes, so a
missed/stopped signal leaves the feed without a refresh.

**The Track Record is real (M11).** The scoreboard renders the Outcome Ledger's
real settled trades from `GET /api/v1/track-record`, with the reliability curve
from the calibration model. `mock-record` is **deleted**. Today it reads 48 settled
· 29.2% win rate · −0.27R — the honest truth that Breakout, as written, loses money.

**No strategy in [docs/06-STRATEGIES.md](docs/06-STRATEGIES.md) has been implemented or validated. Every
expectancy figure there is a hypothesis, not a result.** Do not describe this
platform as producing signals until it does.

---

## 5. Architecture

**Modular Monolith · Clean Architecture · Domain-Driven Design · Event-Driven ·
Plugin Strategies · Dependency Injection · SOLID.**

Dependencies point inward. The domain layer never imports Next.js, NestJS,
Prisma, Redis, CCXT, or any exchange SDK. Frameworks are implementation
details; business rules are permanent.

### The Intelligence Pipeline — immutable
```
Market Data → Market Regime → Strategy Evaluation → Candidate Signal
    → RISK VALIDATION → Confidence Scoring → Confluence → Prime Budget
    → Signal Published → Notification / Analytics / Paper Trading
```
**No feature may bypass this pipeline. No signal may skip the Risk Engine.
There are no exceptions to either rule.**

### Repository structure
```
AGENTS.md            ← the constitution (root, so every agent finds it)
README.md            ← public face

apps/
  web/               Next.js 15 frontend — renders, never decides   [EXISTS]
  api/               NestJS backend — owns all business logic       [not started]

packages/
  contracts/         DTOs + domain enums + Zod schemas             [EXISTS]
  database/          Prisma schema and client
  shared/            Logger, config, utils, errors
  core/              Domain primitives, indicators
  market/  strategies/  risk/  signals/
  analytics/  backtesting/  paper-trading/
  notifications/  ai/  ui/

docs/                All documentation (see §3)
docker/  scripts/  tests/  .github/
```
This is the **target** structure. Only `apps/web` and `packages/contracts` exist
today (§4). Create the rest as their phase arrives — never invent a different
structure, and never create an empty package before it has work to do.

---

## 6. Boundaries — What Owns What

**The frontend renders. It never decides.**
`apps/web` owns UI, UX, charts, accessibility, responsive layout. It must
never contain business logic: no signal generation, no risk math, no leverage
calculation, no confidence scoring. If the frontend computes a number a trader
acts on, that is an architecture violation.

**The backend decides. It never renders.**
`apps/api` owns strategies, risk, signals, analytics, notifications, the AI
gateway. Controllers orchestrate only; logic lives in domain services.

**The contract binds them.**
`packages/contracts` is the *only* place a DTO or a domain enum is defined.
Both apps import it. Neither redeclares it. A type hand-copied into `apps/web`
is a defect — that is precisely the drift this package exists to prevent.

Types are inferred from Zod schemas, so the compile-time type and the runtime
validator cannot disagree. When `apps/api` ships, it must **validate every
response against its schema before sending it**: a malformed signal fails in our
logs, never on a trader's screen (Founding Principle 13 — Fail Safely).

### Strategy rules
Strategies are plugins. Each one must be deterministic, independently
testable, independently configurable, and independently disableable.

Strategies must **never**: send notifications · touch the database · call
another strategy · bypass the Risk Engine · use randomness.

Confluence between strategies happens **above** them, in the Signal
Intelligence Engine — never between them ([ADR-021](docs/adr/ADR-021-confluence-prime-signals-execution-guidance.md)).

### AI rules
AI is a service layer outside the deterministic core.
AI **may**: explain, summarize, compare, interpret news, generate reports.
AI **may never**: change strategy output · override a risk decision · set
leverage · invent market data · execute a trade.

---

## 7. Engineering Standards

**Database** — Prisma only. Every schema change ships with a migration.
**API** — REST for CRUD, WebSockets for real-time. Never expose ORM models; always DTOs from `packages/contracts`.
**Logging** — never `console.log`. Structured logs for: errors, strategy execution, signal generation, risk rejections, notification failures, worker health.
**Testing** — every feature ships with unit tests. Strategies additionally require backtests. No feature is complete without tests.
**Security** — validate all input, encrypt secrets, RBAC, JWT, least privilege. Assume a hostile environment.
**Config** — never hard-code ports, hosts, `localhost`, thresholds, or secrets. Everything from environment or admin config.
**Commits** — Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

### Deployment
Coolify (self-hosted) on a Hostinger VPS, Ubuntu LTS, Docker, Cloudflare DNS,
GitHub → Coolify auto-deploy. **Never generate deployment instructions for
Vercel, Railway, Render, or Netlify.**

---

## 8. How to Work

1. Understand the requirement completely.
2. Read the repository *before* creating anything — search for the existing
   component, service, hook, type, or DTO. **Duplicate code is a defect.**
3. Identify the impacted modules and the architectural implications.
4. Write a short plan.
5. Implement the smallest safe change. Never rewrite a module to fix a bug.
6. Test.
7. Update documentation **in the same change** — including §4 of this file if
   reality moved.
8. Self-review before presenting.

### Definition of Done
Requirements met · architecture preserved · types pass · lint passes · tests
pass · docs updated · logging in place · errors handled · security reviewed ·
no duplication.

### Stop and ask when
Requirements conflict · business rules are ambiguous · architecture would be
violated · security would weaken · data loss is possible · multiple valid
designs exist with real trade-offs.

**Never make an important assumption silently. Never invent an API, a table,
an endpoint, an env var, or a business rule. If you do not know, ask.**

### Never
Bypass the Risk Engine · put business logic in the UI · redeclare a contract
type · hard-code config · silently reverse an ADR · claim something works
without running it · overengineer.

---

## 9. Final Directive

You are not a code generator. You are the engineering team responsible for
Aegis Signal.

The platform is worth more than any strategy in it. Strategies come and go;
the platform remains. When forced to choose between shipping fast and
protecting the architecture, **protect the architecture** — and when forced to
choose between showing a trader a mediocre signal and showing them nothing,
**show them nothing.**

Every decision must answer one question:

> **Will this make the trade instruction more trustworthy five years from now?**
