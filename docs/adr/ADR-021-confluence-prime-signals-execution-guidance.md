# ADR-021 — Confluence Signals, Prime Signal Budget, and Execution Guidance

**Status:** Accepted
**Date:** 2026-07-12
**Related:** [01-PRODUCT_BIBLE](../01-PRODUCT_BIBLE.md) §9 (Accuracy over quantity), [02-FOUNDING_PRINCIPLES](../02-FOUNDING_PRINCIPLES.md) P4 (Strategies are independent), [04-PROJECT_PRD](../04-PROJECT_PRD.md) §13.5, [05-SOLUTION_ARCHITECTURE](../05-SOLUTION_ARCHITECTURE.md) §9

---

## Context

The original signal model produced one signal per strategy and surfaced every
validated opportunity equally. Product direction (owner decision, 2026-07-12)
requires:

1. **Few, elite signals** — roughly 4–5 very-high-confidence signals per day,
   delivered whenever conditions are met, not a feed of everything.
2. **Strategy confluence** — multiple strategies agreeing on the same market
   should produce ONE signal with elevated confidence, not N parallel signals.
3. **Execution guidance** — every signal must tell the trader exactly how to
   act: exchange, spot or perpetual, suggested leverage, timeframe, entry,
   stop, targets — so the trade can be executed manually on the exchange in
   seconds. The platform delivers the signal (in-app, Telegram, WhatsApp);
   it does not execute (execution remains Version 2.0, per PRD §22).

## Decision

### 1. Confluence happens ABOVE strategies, never between them
Strategies remain independent plugins that never communicate
(Founding Principle 4 is preserved). A **Confluence stage inside the Signal
Intelligence Engine** groups candidate signals by (market, direction,
timeframe window) after risk validation. When ≥2 independent strategies agree,
it emits a single fused signal that:
- credits every contributing strategy (`strategies: string[]`),
- receives a bounded confidence uplift derived from historical confluence
  performance (calibrated, never additive guesswork),
- adds a "Strategy Confluence" contributor to the confidence breakdown.

### 2. Prime Signal budget
A curation stage ranks fused, risk-validated signals and awards **Prime**
status to at most N per day (default N=5, configurable) that clear a
confidence floor (default ≥88, configurable). Only Prime signals trigger
push notifications. Non-prime signals remain visible in the scanner for
transparency.

### 3. Execution guidance is Risk Engine output
The Risk Engine (backend) decides deterministically, per signal:
- `marketType`: SPOT or PERPETUAL (SHORT is always PERPETUAL),
- `suggestedLeverage`: bounded by risk level, stop distance, and volatility
  (e.g. HIGH risk → ≤3x; LOW risk short-timeframe → up to 20x),
- the parameters the UI renders as a one-sentence trade instruction.

AI never sets leverage. The frontend never computes it — it renders fields
provided by the API. Every leverage suggestion ships with a risk disclaimer.

### 4. Fundamentals join the confidence model later
Fundamental/news/on-chain analysis enters as additional confidence
contributors via the AI Intelligence layer (interpretation) feeding
deterministic scoring inputs — it never bypasses the pipeline.

## Alternatives considered

- **Strategies calling each other for confirmation** — rejected: breaks
  plugin independence, untestable coupling.
- **Showing only prime signals everywhere** — rejected: hides evidence;
  transparency requires the full validated set to stay inspectable.
- **Auto-execution now** — rejected: PRD already sequences execution to v2.0;
  signals must earn a track record first (Continuous Validation principle).

## Consequences

- Signal DTOs gain: `strategies: string[]`, `marketType`, `suggestedLeverage`,
  `isPrime`. One-strategy signals are the degenerate case (array of one).
- Notification Center consumes only Prime events by default.
- Backtesting must be able to replay the confluence + prime stages.
- Frontend (Milestones 02–04) renders these fields now from mock data shaped
  exactly like the future DTOs; see [07-BACKEND_REQUIREMENTS](../07-BACKEND_REQUIREMENTS.md) for
  the backend obligations this creates. Those DTO shapes are now enforced by
  `packages/contracts` ([ADR-022](ADR-022-contract-first-backend.md)).
