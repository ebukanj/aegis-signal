# ADR-022 — Frontend-First Sequencing and the Contract-First Backend

**Status:** Accepted
**Date:** 2026-07-12
**Supersedes:** nothing. **Amends:** repository structure in [05-SOLUTION_ARCHITECTURE](../05-SOLUTION_ARCHITECTURE.md) §12.
**Related:** [AGENTS.md](../../AGENTS.md) §2 (ownership map), §4 (current reality), [ADR-021](ADR-021-confluence-prime-signals-execution-guidance.md), [BACKEND_NOTES](../BACKEND_NOTES.md)

---

## Context

Aegis Signal was built frontend-first. `apps/web` is complete across every
workspace — dashboard, scanner, signal detail, strategies, analytics,
backtesting, paper trading, notifications, admin — and renders **mock data**.
`apps/api` did not exist, and `packages/` was empty, while
[05-SOLUTION_ARCHITECTURE](../05-SOLUTION_ARCHITECTURE.md) §12 declared thirteen packages and a NestJS backend.

This produced three problems, discovered during a documentation audit:

1. **The decision was never recorded.** Nothing explained *why* the backend was
   absent, so a future contributor could only conclude it was an oversight —
   or worse, that it existed.
2. **The docs drifted into fiction.** [04-PROJECT_PRD](../04-PROJECT_PRD.md) §24 had all twelve
   "Definition of Product Completion" boxes checked, asserting that exchanges
   stream data, strategies execute, and the Risk Engine validates signals.
   None of it existed.
3. **The mocks quietly became the source of truth.** The DTO shapes lived in
   three hand-maintained files under `apps/web/src/features/*/types.ts`.
   [BACKEND_NOTES](../BACKEND_NOTES.md) named this the "mock parity contract" and asked the future
   backend to match them — an honest stopgap, but one enforced by nothing
   except memory. The moment `apps/api` shipped its own DTOs, the two
   definitions would drift, silently, in a system whose entire value rests on
   the trader trusting the numbers on screen.

Frontend-first was **not a mistake**. Building the product surface before
committing to a backend contract is a legitimate way to discover what the
contract should actually be, and [ADR-021](ADR-021-confluence-prime-signals-execution-guidance.md) is direct evidence it worked: the
Prime/confluence/execution-guidance model emerged *from* rendering signals and
finding the shape wanting. The mistake would be *continuing* without turning
those discovered shapes into an enforced contract.

## Decision

### 1. The frontend-first phase is recorded as deliberate, and now closed
`apps/web` remains the reference implementation of the product surface. Its
mock data stays until the corresponding API endpoint ships, then is **deleted**
— never adapted, never kept "just in case". A surviving mock is a second source
of truth.

### 2. `packages/contracts` is the single owner of the API surface
One package defines every DTO, every domain enum, and a Zod schema per DTO.
- `apps/web` imports it. It does not redeclare types.
- `apps/api` imports it. It does not redeclare types.
- Zod schemas make the contract **executable**: the API validates responses
  against the same schema the frontend parses them with. Drift becomes a
  test failure, not a production bug.

The contract is derived from the shapes the frontend already proved it needs —
`Opportunity`, `SignalDetail`, `DashboardSignal`, and the domain enums in
`apps/web/src/types/domain.ts` — so this is a *lift*, not a redesign.

### 3. `apps/api` is deliberately NOT created yet
A NestJS skeleton was scaffolded during this change and then **removed**. It
added module shells that did nothing, and it could not be verified to boot on
the development machine — an unverified, empty backend in the tree is worse
than no backend, because the next contributor cannot tell which parts are real.

The backend gets its own session, with its own plan, and it starts from the
contract. Until then, `apps/api` does not exist and [AGENTS.md](../../AGENTS.md) §4 says so
plainly.

### 4. The Risk Engine owns execution guidance, in code
`marketType`, `suggestedLeverage`, and position sizing are Risk Engine outputs.
`apps/web/src/lib/trade-instruction.ts` currently *formats* them; when
notifications ship, that formatting moves server-side so every channel — UI,
Telegram, WhatsApp — emits identical text from one function.

## Alternatives considered

- **Backend-first, discard the frontend.** Rejected: throws away a complete,
  working product surface and the contract knowledge embedded in it.
- **Let `apps/api` define DTOs, frontend adapts.** Rejected: this is the drift
  we are trying to kill. Two definitions is one too many, regardless of which
  one is "primary".
- **Share types only (no Zod).** Rejected: TypeScript types vanish at runtime.
  A shared `interface` cannot catch an API that returns `confidence: "87"` as a
  string, or omits `stopLoss`. On a platform where a malformed number is a real
  trader's real money, the contract must be enforced at runtime.
- **Keep docs at root.** Rejected: nine root-level markdown files with three
  competing "single source of truth" claims is what created this confusion.

## Consequences

**Positive**
- One definition of the API surface, enforced at compile time *and* runtime.
- The absent backend is now a recorded, bounded decision instead of an unknown.
- `AGENTS.md` §4 tells every future agent what actually exists, so no one
  believes the PRD's checkboxes again.

**Negative / accepted cost**
- `packages/contracts` must be updated *before* either app changes a shape.
  This is friction by design — it is the friction that prevents drift.
- `packages/contracts` must be built before the apps typecheck against it, so
  the root `typecheck`, `test` and `dev` scripts build it first.

**Risks**
- A contributor may still hand-write a type in `apps/web` out of habit. The
  ownership map in [AGENTS.md](../../AGENTS.md) §2 names this a defect explicitly, and code review
  must enforce it.

## Follow-up required when the backend starts

1. `apps/api` (NestJS) imports `@aegis/contracts` and **validates every
   response against its schema before it ships** — a `contract(schema, payload)`
   helper at the controller boundary. This is what makes the contract enforced
   rather than merely declared: TypeScript types vanish at runtime, schemas do
   not. A malformed signal must fail in our logs, never on a trader's screen.
2. `apps/web/src/lib/trade-instruction.ts` formats Risk Engine output into the
   one-sentence trade instruction. Move that formatting server-side when
   notifications ship, so the dashboard, Telegram and WhatsApp all emit
   identical text from one function.
3. Delete each mock in `apps/web` as its endpoint lands. Never adapt one.
