# Backend Requirements Notes

Running list of backend obligations created by frontend milestones and product
direction. Each item must be honored when `apps/api` is built.
Related: [ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md),
[ADR-023](adr/ADR-023-strategy-as-document.md),
[ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md).

---

## The four engines (ADR-024)

The frontend is building the contract these fill. **The frontend must never
compute a confidence score, a pattern, or an indicator** — it renders, it never
decides ([AGENTS.md](../AGENTS.md) §6). A faked number in `apps/web` is how the platform ended up
displaying a random 91% in the first place.

### 1. Indicator engine
Computes every indicator in the contract's `Indicator` enum from OHLCV. Pure,
deterministic, unit-testable against known reference values (TradingView or
TA-Lib as the oracle).
- Tier 1 momentum: MACD, Stochastic, KDJ, CCI, Williams %R, ROC, MFI
- Tier 2 trend: Supertrend, Ichimoku, Parabolic SAR, DMI
- Tier 3 volume: OBV, CVD, anchored VWAP, Volume Profile
- Tier 4 volatility: Keltner, Donchian, historical volatility
- Tier 5 derivatives: long/short ratio, liquidations, predicted funding —
  **blocked on a derivatives data feed.**

### 2. Pattern engine
Swing detection → market structure → geometry. Each detector returns
`{ detected: boolean, quality: 0..1 }`.
- Structure (objective, highest value): swing highs/lows, HH/HL/LH/LL, Break of
  Structure, Change of Character, liquidity sweep, fair value gap, order block,
  range, double top/bottom
- Geometry (quality-scored): bull/bear flag, pennant, falling/rising wedge,
  ascending/descending triangle
- **Never implement:** head & shoulders, cup & handle, Elliott waves. Subjective
  — a deterministic detector would be inventing certainty.

### 3. Confidence engine
Scores the named contributors by their stated weights and emits the **full
breakdown**, never a bare number. Every contributor carries `weight`, `source`
and the `measured` value it was derived from.

### 4. Calibration job
The reason the number is allowed to exist at all.
- **Historical prior:** replay each strategy over exchange OHLCV. Walk-forward —
  calibrate on older candles, validate on newer.
- **Live ledger:** ingest settled signal outcomes.
- **Blend:** Beta prior with shrinkage; history is dropped once a score bucket
  has ~30 live results.
- **Publish the reliability curve** — "when we say 90, we are right X% of the
  time."
- **Historical and live are never merged behind one unlabelled percentage.** The
  `CalibratedConfidence` DTO makes this structurally impossible: it carries both
  rates, both sample sizes, and which one is being displayed.

### Disabled strategies are inert (ADR-024)
A disabled strategy cannot fire, cannot contribute to a Prime signal, and cannot
appear as a confluence partner. The Scanner may still *explore* with one, but
those results are never Prime-eligible. UNPROVEN strategies stay barred from
Prime (ADR-023 §4).

---

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
