# Aegis Signal

> Measure the Market. Protect the Trader.

Institutional-grade Crypto Market Intelligence Platform.

**Aegis Signal does one thing:** it tells a trader *here is a trade worth taking
right now, here is exactly how to take it, here is why, and here is what proves
it wrong* — and says nothing at all when no such trade exists. Everything else
in this repository exists to make that one output trustworthy enough to act on.

## Start Here

**[AGENTS.md](AGENTS.md) is the single source of truth.** It is the constitution:
it settles every conflict and declares who owns every decision. Read it first —
before the code, before the other docs.

Then, in order:

| # | Document | Owns |
|---|---|---|
| 1 | [docs/01-PRODUCT_BIBLE.md](docs/01-PRODUCT_BIBLE.md) | Product identity and philosophy |
| 2 | [docs/02-FOUNDING_PRINCIPLES.md](docs/02-FOUNDING_PRINCIPLES.md) | Non-negotiable principles |
| 3 | [docs/03-ENGINEERING_PHILOSOPHY.md](docs/03-ENGINEERING_PHILOSOPHY.md) | Engineering standards |
| 4 | [docs/04-PROJECT_PRD.md](docs/04-PROJECT_PRD.md) | Requirements and roadmap |
| 5 | [docs/05-SOLUTION_ARCHITECTURE.md](docs/05-SOLUTION_ARCHITECTURE.md) | System design |
| 6 | [docs/06-STRATEGIES.md](docs/06-STRATEGIES.md) | Trading logic |
| 7 | [docs/07-BACKEND_REQUIREMENTS.md](docs/07-BACKEND_REQUIREMENTS.md) | What the backend must build — **start here for `apps/api`** |
| 8 | [docs/adr/](docs/adr/) | Decisions already made |

## Status

**The frontend is complete, polished, and honest.** `apps/web` renders **mock
data**: zero lint errors, zero warnings, strict TypeScript, build green.
`packages/contracts` holds every DTO, enum, indicator, pattern and invariant —
34 tests passing.

**The backend does not exist.** No market data flows anywhere. The platform does
not produce signals, and no strategy has been validated.

The frontend fakes exactly two things, deliberately and visibly:

1. **Confidence scores** — assembled in the honest shape, but the numbers are
   invented and every one is stamped **UNCALIBRATED** on screen.
2. **Market data** — prices, indicators, patterns and live ticks are simulated.

Replacing both is the backend's job, specified end-to-end in
**[docs/07-BACKEND_REQUIREMENTS.md](docs/07-BACKEND_REQUIREMENTS.md)**.

[AGENTS.md §4](AGENTS.md) holds the authoritative status. Trust it over any
other document.

## Repository Layout

```
AGENTS.md            The constitution — read first
apps/
  web/               Next.js 15 frontend — renders, never decides
packages/
  contracts/         DTOs, domain enums, runtime schemas — the API contract
docs/                All documentation
```

`apps/api` and the remaining packages arrive with the backend phase
([ADR-022](docs/adr/ADR-022-contract-first-backend.md)).

## Getting Started

Requirements: Node ≥ 20, pnpm ≥ 10.

```bash
pnpm install
pnpm dev          # web app → http://localhost:3000
pnpm typecheck    # all workspaces
pnpm test         # all workspaces
pnpm lint
pnpm build
```

## The Contract

`packages/contracts` is the **only** place a DTO or domain enum is defined.
Both apps import it; neither redeclares it. Types are inferred from Zod schemas,
so the compile-time type and the runtime validator cannot disagree — and the
API validates every response before it ships, meaning a malformed signal fails
in our logs rather than on a trader's screen.

A type hand-copied out of the contract is a defect. See
[ADR-022](docs/adr/ADR-022-contract-first-backend.md).

## Stack

**Frontend** — Next.js 15 · React 19 · TypeScript (strict) · TailwindCSS v4 ·
shadcn/ui · TanStack Query · Zustand · Zod · Framer Motion.
Design tokens: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

**Backend** — NestJS · Prisma · PostgreSQL · Redis · BullMQ · WebSockets · CCXT.

**Deploy** — Docker → Coolify on Hostinger VPS, Cloudflare DNS.
Never Vercel, Railway, Render, or Netlify.
