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
| `apps/web` | **Built and polished.** Next.js 15. Renders **mock signals**, but the **live price is now real** (see below). Zero lint errors, strict TypeScript, build green. Seven workspaces: Signals · Scanner · Strategies · Insights · Track Record · Notifications · Settings (+ Admin). |
| `packages/contracts` | **Built and tested.** 87 tests. **Owns the six strategy documents** — one copy, imported by both apps. The one definition of every DTO, domain enum, indicator, pattern and invariant. |
| Strategies | **Six plain-English documents**, not code ([ADR-023](docs/adr/ADR-023-strategy-as-document.md)). Vocabulary covers 47 indicators, divergence, market structure and chart patterns ([ADR-024](docs/adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)). **None is implemented or validated. All are UNPROVEN.** |
| `apps/api` | **Built through Milestone 09.** 559 tests. NestJS, Prisma, Redis, BullMQ, Pino, Terminus. `/health` checks database, redis, queue **and exchange connectivity**. |
| `packages/database` | **Built.** Prisma schema + local Postgres (`aegis_signal`). |
| **Market Data & Exchange Layer** | **BUILT AND LIVE.** Real Binance + Bybit data. CCXT REST, native Binance WebSocket, symbol registry, circuit breaker, rate limiter, boundary normalizer, Redis cache, Socket.IO gateway. **Real candles and real prices flow end to end.** |
| **Indicator Engine** | **BUILT.** All 47 contract indicators, cross-checked against an independent library and verified on live BTC candles. Registry, multi-timeframe resolver, Redis cache, validation gate, 16 operators, divergence engine, benchmark suite. See [docs/08-INDICATORS.md](docs/08-INDICATORS.md). |
| **Pattern Engine** | **BUILT.** 24 detectors: swings, market structure (BOS/CHoCH), zones, liquidity sweeps, FVGs, order blocks, flags, wedges, triangles, channels, double/triple tops. Every detection carries evidence AND weaknesses. Guarded by a false-positive suite over random walks. **Head & shoulders, cup & handle and Elliott waves remain REFUSED** (ADR-024) — see [docs/09-PATTERNS.md](docs/09-PATTERNS.md). |
| **Market Regime Engine** | **BUILT.** Two orthogonal axes (direction + volatility), a five-voter weighted vote with signed scores, hysteresis with a dwell, multi-timeframe alignment/conflict, and strategy compatibility **declared on the strategy document** (ADR-023). Replayed against real BTC history: 2021 bull, 2022 bear, mid-2020 chop, COVID crash. `agreement` is stamped **UNCALIBRATED** forever — there is no ground truth for a regime, so a regime "probability" is unfalsifiable by construction. See [docs/10-REGIME.md](docs/10-REGIME.md). |
| **Strategy Evaluator** | **BUILT.** One generic document interpreter — **zero strategy-specific code, proven by a test that greps the module's own source**. Entry language: ALL-OF of [rule \| ANY-OF group], with NOT. Versioning: editing a rule bumps the version and **wipes the track record** (ADR-024). Produces CANDIDATES — no confidence, no approval, no risk validation. Verified on live BTC. See [docs/11-STRATEGY-EVALUATOR.md](docs/11-STRATEGY-EVALUATOR.md). |
| **Risk Engine (The Veto)** | **BUILT.** 14 gates, every limit externalised in `risk.policy.ts` and checked for self-contradiction at boot. Sizes from the **stop**, never the leverage; walks leverage down until **liquidation clears the stop by 1.5R**, and vetoes if no level is safe. A feed that was never built (news, ledger, funding) reads **UNASSESSED and is named to the trader**; a feed that *should* be there and is dark **vetoes**. Verified on live BTC: a sane trade approved, four bad ones refused with the measurement. See [docs/12-RISK-ENGINE.md](docs/12-RISK-ENGINE.md). |
| **Confidence & Calibration Engine** | **BUILT.** The trust layer. Kills the fabricated `randInt(52,92)+4` score for good. The **score** is named contributors with stated weights — real evidence, day one; the **probability** is earned only from outcomes. A background **replay** walks 2 years of real Binance history through the *same* evaluator, risk veto and score builder (no reimplementation), labels each setup (target-before-stop = WIN; a bar touching both = LOSS; neither = EXPIRED, a non-win), and fits **three** calibrators (shrinkage / Platt / isotonic) — shipping whichever has the best **out-of-sample** ECE. **Beta shrinkage** stops three lucky setups becoming a 100% win rate; **history and live are never merged** behind one number; every model is **versioned and never overwritten**. Prime stays barred (UNPROVEN, ADR-023 §4). See [docs/13-CONFIDENCE.md](docs/13-CONFIDENCE.md). |
| Signal Engine · Notifications · AI layer | **Not built.** Approved, confidence-scored trades are produced and **nothing publishes them yet.** |

### What the frontend still fakes, and must stop faking

1. **Confidence.** Mock scores are assembled in the honest *shape*
   (`CalibratedConfidence`), but the numbers are invented and every one is
   labelled **UNCALIBRATED**. The Confidence Engine and the Calibration job own
   the real thing.
2. **Signals.** Entries, stops, targets and the strategies that produced them are
   still mock. Their entry prices are anchored to real market prices only so the
   live-price verdict is coherent — the *signals themselves are fabricated*.
3. **Indicators and patterns.** Still simulated. **No component may ever compute
   these** — the frontend renders, it never decides (§6). A faked number in
   `apps/web` is exactly how this platform once shipped a random "91%".
4. **Sizing and the safe-leverage cap.** `position-calculator.tsx` re-derives
   position size, liquidation price and the highest safe leverage **in the
   browser**. That arithmetic now has an owner — the Risk Engine — and two
   implementations of a liquidation formula is one implementation too many. The
   what-if sliders may stay; **the numbers must come from the decision**, and the
   safe-leverage cap must be `leverage.suggested`, not a second guess at it.

### What is no longer faked

**The live price is real.** It streams from Binance, through the market module,
over the Socket.IO gateway, into `useLivePrice`. The seeded random walk that used
to power it is **deleted**. When no price has arrived, the UI says
"Waiting for price…" rather than inventing a plausible one — an honest blank beats
a confident lie, because a trader cannot tell the two apart.

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
