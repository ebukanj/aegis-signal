# Backend Requirements Notes

Running list of backend obligations created by frontend milestones and product
direction. Each item must be honored when `apps/api` is built.
Related: [ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md).

## Signal Engine
- **Confluence stage** (ADR-021): group risk-validated candidates by
  (market, direction, timeframe window); fuse agreeing strategies into one
  signal with `strategies: string[]` and a calibrated confidence uplift.
- **Prime budget stage**: at most N prime signals/day (default 5, config),
  confidence floor (default 88, config). Prime status is immutable once
  awarded; the day's budget is auditable.
- Signal DTO must include: `strategies[]`, `marketType` (SPOT | PERPETUAL),
  `suggestedLeverage` (int | null), `isPrime`, `expiresAt`, confidence
  breakdown contributors (including "Strategy Confluence" when applicable).

## Risk Engine
- Owns `marketType` and `suggestedLeverage` — deterministic rules from risk
  level, stop distance, volatility, timeframe. SHORT ⇒ PERPETUAL always.
  Caps: HIGH ≤ 2–3x, ELEVATED ≤ 5x, MODERATE ≤ 10x, LOW ≤ 20x (config).
- Trade-instruction fields are Risk Engine output; the frontend only formats
  the sentence (see `apps/web/src/lib/trade-instruction.ts` — move this
  formatting server-side when notifications ship so all channels send
  identical text).

## Notification Center
- Push only Prime signals by default (in-app, Telegram, WhatsApp).
- Message body = the same trade instruction the dashboard renders.

## Analytics / Backtesting
- Track prime vs non-prime performance separately (the prime selector itself
  must be measurable).
- Backtests must replay confluence + prime stages, not just raw strategies.

## AI / Fundamentals (later)
- Fundamental & news interpretation feeds deterministic confidence
  contributors ("Fundamentals", "News Risk") — it never bypasses the pipeline
  and never sets leverage.

## The contract (supersedes the old "mock parity contract")
DTO shapes are no longer hand-maintained in `apps/web`. They live in
**`packages/contracts`**, which both apps import and neither redeclares
([ADR-022](adr/ADR-022-contract-first-backend.md)):

- `Opportunity` — scanner
- `SignalDetail`, `SignalDetailResponse`, `AICommentary` — signals
- `MarketIntelligence`, `PlatformHealth`, `DashboardSignal`,
  `StrategyHealthSummary`, `ActivityEvent`, `MarketOverview` — dashboard
- every domain enum

Types are inferred from Zod schemas, so the type and the validator cannot
disagree. **When `apps/api` is built, every response must be validated against
its schema before it ships** — a payload that violates the contract must fail at
our boundary, in our logs, not on a trader's screen.

**Changing a shape means changing the contract first.** A type hand-copied into
either app is a defect (AGENTS.md §2).

When an endpoint ships, **delete** the corresponding mock in `apps/web` — never
adapt it. A surviving mock is a second source of truth.
