# Solution Architecture: Aegis Signal

**Product:** Aegis Signal  
**Version:** 1.0  
**Status:** Approved  
**Governed by:** [AGENTS.md](../AGENTS.md) — the constitution and ownership map.  
**Owns:** system design, module boundaries, event flow.  

> This document describes the **target** system. For what actually exists today,
> see [AGENTS.md §4](../AGENTS.md) — it is the authority, and most of what
> follows is not built yet.


---

## 1. Solution Overview
Aegis Signal is an AI-assisted, event-driven, modular market intelligence platform for cryptocurrency trading.
The platform scans multiple exchanges, evaluates quantitative strategies, validates risk, ranks opportunities, explains every signal, and delivers actionable trading intelligence.

The architecture follows:
* **Modular Monolith**
* **Clean Architecture**
* **Domain-Driven Design (DDD)**
* **Event-Driven Architecture**
* **Plugin-Based Strategies**
* **AI Provider Abstraction**

---

## 2. Technology Stack

### Frontend
* **Framework:** Next.js 15
* **Library:** React 19
* **Language:** TypeScript
* **Styling:** TailwindCSS
* **Components:** shadcn/ui
* **Data Fetching:** TanStack Query
* **State Management:** Zustand
* **Charts:** TradingView Widget
* **Animations:** Framer Motion

### Backend
* **Framework:** NestJS
* **Language:** TypeScript
* **ORM:** Prisma ORM
* **Database:** PostgreSQL
* **Caching/PubSub:** Redis
* **Queue System:** BullMQ
* **Real-time:** WebSockets

### Infrastructure
* **Containerization:** Docker
* **Web Server/Reverse Proxy:** NGINX
* **CDN & Security:** Cloudflare
* **CI/CD:** GitHub Actions

### AI Providers
* Claude
* OpenAI
* Gemini
*(All AI providers are interchangeable and abstracted)*

---

## 3. High-Level Architecture

```
Users
  │
  ▼
Next.js Frontend
  │
REST + WebSockets
  │
NestJS API
  │
──────────────────────────
Domain Layer
──────────────────────────
Market Intelligence
Market Regime
Strategy Engine
Risk Engine
Signal Engine
Analytics
Backtesting
Paper Trading
Notification Center
AI Intelligence
Administration
──────────────────────────
Infrastructure
──────────────────────────
PostgreSQL
Redis
BullMQ
CCXT
TradingView
Telegram
WhatsApp
Email
```

---

## 4. Domain Modules

### Authentication
* Login
* RBAC (Role-Based Access Control)
* JWT
* Session Management

---

### Market Intelligence
**Responsible for:**
* Exchange connections
* Market data
* OHLCV
* Funding
* Open Interest
* Liquidations

**Produces:**
* `MarketUpdated` Event

---

### Market Regime
**Determines:**
* Bull
* Bear
* Range
* Transition
* High Volatility

**Produces:**
* `MarketRegimeChanged`

---

### Strategy Engine
* Loads strategy plugins.
* Each strategy is independent.

**Produces:**
* `StrategyEvaluated`
* `CandidateSignalCreated`

---

### Risk Engine
**Validates:**
* Liquidity
* Correlation
* Portfolio Heat
* Spread
* Duplicate Signals

**Produces:**
* `RiskValidated`
* `RiskRejected`

---

### Signal Engine
* Creates: `LONG`, `SHORT`, `WATCHLIST`, `NO SIGNAL`
* Ranks signals.
* Stores signals.

---

### Analytics
**Tracks:**
* Win Rate
* Expectancy
* Drawdown
* Profit Factor
* Signal Accuracy
* Strategy Health

---

### Backtesting
* Historical validation.

**Produces:**
* Performance Reports
* Trade History
* Equity Curve

---

### Paper Trading
* Virtual portfolio.
* Tracks simulated trades.

---

### Notification Center
**Channels:**
* Telegram
* WhatsApp
* Email

**Future:**
* Discord
* Slack
* Push Notifications

---

### AI Intelligence
**Provides:**
* Signal explanation
* Market summary
* News interpretation
* Strategy comparison

*Note: AI never changes strategy logic.*

---

## 5. Shared Kernel
**Shared packages:**
* Indicators
* Logger
* Configuration
* Market Types
* Constants
* Utilities
* Exceptions
* Enums
* Validation

*Every module depends on the Shared Kernel.*

---

## 6. Event Flow

```
MarketUpdated
      │
      ▼
MarketRegimeChanged
      │
      ▼
StrategiesEvaluated
      │
      ▼
CandidateSignalCreated
      │
      ▼
RiskValidated
      │
      ▼
SignalGenerated
      │
      ├────────► NotificationQueued
      │
      ├────────► AnalyticsUpdated
      │
      ├────────► PaperTradeCreated
      │
      └────────► DashboardUpdated
```

---

## 7. Queue Workers
**BullMQ Workers:**
* Market Scanner
* Strategy Worker
* Risk Worker
* Notification Worker
* Analytics Worker
* Backtesting Worker
* Paper Trading Worker
* AI Worker

---

## 8. WebSocket Channels
* `dashboard`
* `scanner`
* `market`
* `signals`
* `analytics`
* `notifications`
* `strategies`
* `paper-trading`

---

## 9. Strategy Architecture
Every strategy implements `IStrategy`.

**Required methods:**
* `initialize()`
* `evaluate()`
* `validate()`
* `calculateConfidence()`
* `generateSignal()`
* `backtest()`

*Strategies never communicate directly.*

---

## 10. AI Architecture
```
AI Gateway
     │
     ├── Claude
     ├── OpenAI
     └── Gemini
```
* Every AI request passes through the `AI Gateway`.
* Business logic never talks directly to AI providers.

---

## 11. Notification Architecture
```
SignalGenerated
      │
      ▼
Notification Queue
      │
      ├── Telegram
      ├── WhatsApp
      ├── Email
      └── Push (Future)
```
* Every notification is logged.

---

## 12. Monorepo Structure

*Amended by [ADR-022](adr/ADR-022-contract-first-backend.md): `packages/contracts` added as the single owner of the
API surface. Only `apps/web`, `apps/api` and `packages/contracts` exist today —
see [AGENTS.md §4](../AGENTS.md) for what is real.*

```
aegis-signal/
├── AGENTS.md                ← the constitution (root, so agents find it)
├── README.md
├── apps/
│   ├── web/                 Next.js — renders, never decides
│   └── api/                 NestJS — owns all business logic
├── packages/
│   ├── contracts/           DTOs + domain enums + Zod schemas  ← the contract
│   ├── database/            Prisma schema and client
│   ├── shared/              Logger, config, utils, errors
│   ├── core/                Domain primitives, indicators
│   ├── market/
│   ├── strategies/
│   ├── risk/
│   ├── signals/
│   ├── analytics/
│   ├── notifications/
│   ├── ai/
│   ├── backtesting/
│   ├── paper-trading/
│   └── ui/
├── docs/
├── tests/
├── scripts/
├── docker/
└── .github/
```

**The contract rule:** `packages/contracts` is the only place a DTO or a domain
enum is declared. `apps/web` and `apps/api` both import it. Neither redeclares
it. A hand-copied type is a defect.

---

## 13. Core Principles
* **Modular Monolith:** Clean boundary separation.
* **Event-Driven:** Decoupled, asynchronous operations.
* **Plugin-Based Strategies:** Dynamic strategy registration.
* **Clean Architecture & DDD:** Domain model at the core.
* **Configuration over Code:** Highly customizable settings.
* **AI as Assistant:** Deterministic logic for trading; AI for context and explanation.
* **Deterministic Signal Generation:** Strict rule-based checks.
* **Test Everything & Document Everything:** Maintained test-driven culture.

---

## 14. Security
* JWT Authentication
* RBAC (Role-Based Access Control)
* Encrypted Secrets
* API Rate Limiting
* HTTPS Enforcement
* Audit Logs
* Secure Environment Variables

---

## 15. Scalability
The architecture supports:
* Unlimited strategies
* Multiple exchanges
* Thousands of concurrent users
* Horizontal scaling of workers
* Future transition to microservices (if needed)
* Mobile applications
* SaaS deployment

*No major redesign should be required to scale.*

---

## 16. Folder Ownership

### Frontend Owns:
* UI & User Experience
* Dashboard
* Charts
* Authentication UI
* Settings

### Backend Owns:
* Business Logic
* Market Scanner
* Strategies
* Risk Engine
* Signals
* Analytics
* Notifications
* AI Gateway

### Shared Owns:
* Types & Interfaces
* Constants
* Utilities
* Validation
* Configuration

---

## 17. Definition of Success
The architecture is successful when:
* Every module is independently testable.
* Strategies can be added without modifying the core platform.
* AI providers can be swapped without changing business logic.
* Exchanges can be added with minimal effort.
* The platform scales without architectural rewrites.
* Business logic remains independent of frameworks.

---

## Final Architecture Statement
Aegis Signal is designed as an institutional-grade Crypto Market Intelligence Platform. The architecture prioritizes modularity, determinism, scalability, observability, and long-term maintainability. Every feature must strengthen the platform rather than increase complexity.
