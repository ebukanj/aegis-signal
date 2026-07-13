# Aegis Signal — Backend Requirements

**Governed by:** [AGENTS.md](../AGENTS.md) — the constitution and ownership map.
**Owner of:** what `apps/api` must do, and what it must never do.
**Supersedes:** `BACKEND_NOTES.md` (absorbed).
**Reading order:** this document assumes [01-PRODUCT_BIBLE](01-PRODUCT_BIBLE.md) → [02-FOUNDING_PRINCIPLES](02-FOUNDING_PRINCIPLES.md) → [06-STRATEGIES](06-STRATEGIES.md) → [ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md) → [ADR-023](adr/ADR-023-strategy-as-document.md) → [ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md).

---

## 0. Read this first

The frontend is complete and it is **lying in exactly two places, on purpose**:

1. **Confidence scores are invented.** They are assembled in the correct shape
   and every one is stamped `UNCALIBRATED`, but the numbers mean nothing.
2. **Market data is simulated.** Prices, indicators, patterns, live ticks.

Your job is to replace both with truth. Everything else — every DTO, every enum,
every invariant, every strategy document — already exists in
`packages/contracts` and is **already enforced by tests**.

> **The one rule that matters more than any other:**
> **The frontend must never compute a price, an indicator, a pattern, or a
> confidence score.** It renders; it never decides ([AGENTS.md §6](../AGENTS.md)). A number
> computed in `apps/web` is a number nobody validated — that is precisely how
> this platform once displayed `randInt(52, 92)` as a win probability.

### What the product is
> Tell the trader: here is a trade worth taking right now, here is exactly how to
> take it, here is why, and here is what proves it wrong — **and say nothing at
> all when no such trade exists.**

Roughly **4–5 Prime signals a day**. The power to stay silent is as load-bearing
as the power to speak.

---

## 1. The contract is the specification

`packages/contracts` is not documentation of the API — it **is** the API. Import
it. Do not redeclare a single type.

```ts
import {
  strategyDefinitionSchema,   // a strategy is a document, not code
  signalDetailSchema,
  opportunitySchema,
  calibratedConfidenceSchema, // a score cannot pretend to be a probability
  insightsFeedSchema,
  riskFlagSchema,
} from "@aegis/contracts";
```

**Validate every response against its schema before it leaves the process.**

```ts
return contract(signalDetailResponseSchema, await this.signals.findOne(id));
```

The schemas already refuse to represent the mistakes that cost money. These are
enforced by 34 passing tests, and they are your acceptance criteria:

| The schema rejects | Because |
|---|---|
| A SHORT signal on SPOT | Spot cannot be shorted |
| Leverage on a spot trade · a perp with no leverage cap | Nonsense in either direction |
| A stop above entry on a LONG | That is not a stop |
| Take-profits that close >100% of a position | You cannot sell what you do not hold |
| A confidence score that shows a win rate while `basis: UNCALIBRATED` | **A probability with nothing behind it** |
| A `LIVE` win rate with zero live samples | Same lie, different disguise |
| A social spike >40% astroturf marked `corroborated` | Manufactured crowds are how retail becomes exit liquidity |
| A Risk Flag with fewer than 2 independent sources | A false veto costs opportunity; a missed one costs everything |
| `HEAD_AND_SHOULDERS` as a pattern | **Deliberately not in the vocabulary** — see §4 |

---

## 2. Architecture

Modular Monolith · Clean Architecture · DDD · Event-Driven · NestJS · Prisma ·
PostgreSQL · Redis · BullMQ · CCXT. Deployed by Docker → Coolify on a Hostinger
VPS. **Never Vercel, Railway, Render or Netlify.**

### The pipeline — immutable

```
Market Data → Market Condition → Strategy Evaluation → Candidate
   → RISK VALIDATION → Confidence Scoring → Confluence → Prime Budget
   → Signal Published → Notification / Ledger
```

**No feature may bypass this. No signal may skip the Risk Engine. There are no
exceptions to either.**

### Suggested module layout

```
apps/api/src/modules/
  market/        exchange connections, OHLCV, normalisation
  indicators/    §3 — pure functions over candles
  patterns/      §4 — swing detection, structure, geometry
  regime/        what kind of market is this? gates the strategies
  strategy/      §5 — ONE evaluator, reading strategy documents
  risk/          §6 — the veto. Owns marketType, leverage, sizing
  signal/        §7 — confluence, Prime budget, publication
  confidence/    §8 — named contributors, no bare numbers
  calibration/   §9 — historical replay + live ledger → the reliability curve
  insights/      §10 — news, social, fundamentals, Risk Flags
  notifications/ §11 — Prime only
  ledger/        §12 — every signal's outcome. The source of all trust.
```

---

## 3. Indicator Engine

Pure, deterministic functions over OHLCV. Given identical candles they must
produce identical output — no randomness, no wall-clock, no I/O
(Philosophy 14).

Implement **every member of the contract's `Indicator` enum** (47 of them).
Grouped:

| Group | Indicators |
|---|---|
| Price | `open` `high` `low` `close` |
| Volume | `volume` `volume_sma` `obv` `cvd` `vwap` |
| Moving averages | `sma` `ema` |
| Momentum | `rsi` `macd_line` `macd_signal` `macd_histogram` `stoch_k` `stoch_d` `kdj_k` `kdj_d` `kdj_j` `cci` `williams_r` `roc` `mfi` |
| Trend | `adx` `plus_di` `minus_di` `supertrend` `psar` `ichimoku_tenkan` `ichimoku_kijun` `ichimoku_span_a` `ichimoku_span_b` |
| Volatility | `atr` `bb_upper` `bb_middle` `bb_lower` `bb_width` `keltner_upper` `keltner_lower` `donchian_upper` `donchian_lower` |
| Structure | `highest_high` `lowest_low` |
| Statistics | `zscore` |
| **Derivatives** | `funding_rate` `open_interest` `long_short_ratio` — **blocked on a feed** |

**Testing:** unit-test each against a known oracle (TA-Lib or TradingView) on a
fixed candle set. An indicator that is 2% wrong is a strategy that is 100% wrong.

**Operators** the evaluator must support beyond comparison:

- `rising` / `falling` — slope over N bars.
- **`diverges_bullish` / `diverges_bearish`** — price makes a lower low while the
  indicator makes a higher low, over N bars. Requires swing detection (§4).
  This is among the highest-value signals in trading; get it right.

**Multi-timeframe is mandatory.** Every operand carries an optional `timeframe`.
A 1h strategy must be able to ask *"but is the 4h trend up?"*. Resolve
higher-timeframe values without look-ahead bias — use the last **closed** candle
of that timeframe, never a forming one.

> **Look-ahead bias is the single easiest way to build a strategy that backtests
> beautifully and loses money live.** Guard it everywhere.

---

## 4. Pattern Engine

Chart patterns cannot be expressed as `[indicator] [operator] [value]` — they
need swing detection and geometry. Each detector returns
`{ detected: boolean, quality: 0..1 }`.

Build in this order:

**1. Swing detection** — the foundation everything else stands on. A swing high
is a bar whose high exceeds N bars either side. Get this right first; every
pattern below is wrong if it is wrong.

**2. Market structure** *(objective — the highest-value group)*

| Pattern | Definition |
|---|---|
| `HIGHER_HIGH_HIGHER_LOW` | Successive swing highs and lows both rising — an intact uptrend |
| `LOWER_HIGH_LOWER_LOW` | The mirror |
| `BREAK_OF_STRUCTURE` | Price closes beyond the prior swing **with** the trend |
| `CHANGE_OF_CHARACTER` | Price closes beyond a swing **against** the trend, first time. **The earliest evidence a trend is ending — and the most valuable thing in this engine.** |
| `LIQUIDITY_SWEEP` | Wick takes out an obvious swing low, then the candle **closes back above it**. Stops harvested, not a genuine breakdown. |
| `FAIR_VALUE_GAP` | Three-candle imbalance: candle 1's high < candle 3's low (bullish) |
| `ORDER_BLOCK` | The last opposing candle before a displacement move |
| `RANGE` | Price contained between a floor and ceiling for N bars |
| `DOUBLE_TOP` / `DOUBLE_BOTTOM` | Two swings within a tolerance band, with a reaction between |

**3. Geometry** *(quality-scored 0–1 — fit trendlines to the swings, score by R²
and by how well the shape matches its template)*

`BULL_FLAG` `BEAR_FLAG` `PENNANT` `FALLING_WEDGE` `RISING_WEDGE`
`ASCENDING_TRIANGLE` `DESCENDING_TRIANGLE`

### Never implement these
**Head & shoulders. Cup & handle. Elliott waves.**

Ten traders draw them ten different ways. A deterministic detector for them would
be **inventing certainty** — the one thing this platform exists not to do. The
contract's `Pattern` enum does not contain them, and a test asserts that adding
one is rejected. **Do not add them.**

---

## 5. Strategy Engine — ONE evaluator

This is the load-bearing decision of the platform ([ADR-023](adr/ADR-023-strategy-as-document.md)).

A strategy is a **document** (`StrategyDefinition`), not a class. The six
built-ins are seeded rows. A user's strategy is another row of the same shape.

**So you write one evaluator, not eleven plugins.**

```ts
evaluate(strategy: StrategyDefinition, candles: Candles): Candidate | null
```

It reads the document, calls the indicator and pattern engines, and returns a
candidate or nothing. Built-in and custom strategies take the **identical code
path** — there is no second one, and there must never be.

**Consequences you must honour:**

- Adding a strategy is a database row, not a deployment.
- A user-authored strategy runs through the same evaluator. No sandbox, no
  `eval`, no code execution — the closed vocabulary is what makes this safe.
- **`describeStrategy()` already exists in the contract.** Use it for alert text
  so the Telegram message, the signal's "why", and the Strategies page speak the
  same words and cannot drift.

**A DISABLED strategy is inert.** It cannot fire, cannot be a confluence partner,
cannot reach Prime. **An UNPROVEN strategy** (no settled signals) may emit
signals but **never a Prime one**.

**Auto-disable** any strategy whose rolling-50 expectancy turns negative.

---

## 6. Risk Engine — the veto

Nothing reaches a user without passing here. **The Risk Engine's power to say no
IS the product** — "Protect the Trader" is not a slogan, it is this module.

### It owns, and nothing else may compute:
- `marketType` — SPOT or PERPETUAL. **A SHORT is always PERPETUAL.**
- `suggestedLeverage` — capped by risk level, stop distance, volatility.
  Caps: HIGH ≤ 2–3× · ELEVATED ≤ 5× · MODERATE ≤ 10× · LOW ≤ 20× *(config)*.
- Position sizing:

```
PositionSize = (Equity × Risk%) / |Entry − Stop|
```

**Risk is defined by the stop distance, never by leverage.** Leverage only
decides margin efficiency.

### Universal gates — applied before ANY strategy fires
1. 24h quote volume ≥ **$50M**
2. Spread ≤ **0.05%**
3. No signal within **15 minutes** of a tier-1 macro event (FOMC, CPI)
4. **No active Risk Flag on the asset** (§10)
5. Confidence ≥ **75** to alert; below that, log only
6. Correlation cap: ≤ 3 open positions correlated > 0.8
7. Portfolio heat: total open risk ≤ **4%** of equity
8. Duplicate suppression

### The liquidation guard
The frontend calculator already warns when leverage is high enough that the
**exchange liquidates the trader before the stop is hit** — at which point the
stop is decoration and the account is gone before the trade is even proven wrong.
**The Risk Engine must never suggest a leverage where that is true.** Cap it so
liquidation sits at least 1.5× the stop distance away.

**Every rejection is logged with its measured reason** — *"spread 0.081% > 0.05%
limit"*, never just "rejected". The Scanner renders these, and they are what make
a quiet day credible instead of suspicious.

---

## 7. Signal Engine

### Confluence ([ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md))
Group risk-validated candidates by `(market, direction, timeframe window)`. When
≥2 **enabled** strategies agree, fuse them into **one** signal crediting all of
them (`strategies: string[]`).

**Strategies never talk to each other.** Confluence happens *above* them, here.

The confidence uplift must be **measured from the ledger** — if Breakout +
Level Bounce agreeing historically wins 64% versus Breakout's 52% alone, the
uplift is +12. **Until there is data, the uplift is zero** and the signal says
*"uplift not yet calibrated"*. Do not invent `+4 per strategy`; that is what the
old code did and it was meaningless.

### Prime budget
Rank fused signals. Award **Prime** to at most **N per day** (default 5, config)
clearing a confidence floor (default 88, config) **and** coming only from
strategies that are **enabled and proven**.

- Prime status is **immutable once awarded**. The day's budget is auditable.
- **Only Prime signals notify.**
- Non-prime validated signals stay visible for transparency. Nothing is hidden.

### Publication
Every signal is **stored permanently. No signal is ever deleted.** The ledger is
the platform's memory and its conscience.

---

## 8. Confidence Engine

The score is the **sum of named contributors**. Never a bare number.

Each contributor carries `weight`, `source` (`MEASURED` | `LEDGER` |
`HISTORICAL` | `RULE`) and the `measured` value it came from:

```
Breakout base rate in an uptrend       52   LEDGER      52% over 340 setups
+ Level Bounce agrees                  +9   LEDGER      measured uplift
+ Volume confirmation                  +6   MEASURED    2.3× avg (needed 1.5×)
+ Bull flag, quality 0.81              +7   MEASURED
− Resistance overhead                  −8   MEASURED    0.7 ATR to next 4h level
──────────────────────────────────────────
Score                                  66
```

**Contributors must be able to subtract.** A scorer that only ever adds is a
scorer that flatters every trade.

---

## 9. Calibration — the reason a number is allowed to exist

**A score is not a win rate.** Turning one into the other requires evidence.
Three sources, in rising order of trust:

| Source | Available | Trust |
|---|---|---|
| **Historical replay** over exchange OHLCV | Day one | Real, but optimistic |
| **Live ledger** — our own settled signals | Accumulates | The truth |
| **Blend** — Beta prior shrinking toward live | Always | What we display |

Drop history once a score bucket has ~30 live results.

```
Day 1    score 91 · 61% historical   (2yr replay, 1,284 setups; 0 live)
Day 30   score 91 · 66% blended      (1,284 historical + 11 live)
Day 90   score 91 · 87% live         (34 live; history dropped)
```

### Non-negotiables
- **Walk-forward.** Calibrate on older candles, validate on newer. A hit rate
  measured on the same data the rules were tuned on is optimistic — that is how
  signal products lie to themselves.
- **Never merge historical and live behind one unlabelled percentage.** The
  `CalibratedConfidence` DTO makes this structurally impossible: it carries both
  rates, both sample counts, and which one is displayed.
- **Publish the reliability curve** — *"when we say 90, we are right X% of the
  time."* The Track Record page plots it. A point below the diagonal means the
  scorer is overconfident and **must be retuned**.

**This is an engine, not a workspace.** There is no Backtesting page and there
will not be one ([ADR-023](adr/ADR-023-strategy-as-document.md)); the user never operates this.

---

## 10. Insights — and the veto

**Nothing here creates a signal.** A story is a reason to *look*, never a reason
to *buy*. AI assists; AI does not decide (Founding Principle 9).

What insights *can* do is **stop** a trade.

### Risk Flags — absolute
While one is live, **no strategy may signal on that asset.** Not an enabled one,
not a proven one, not three agreeing.

- Kinds: `EXPLOIT` `DEPEG` `DELISTING` `REGULATORY` `OUTAGE` `UNLOCK`
- **Two independent tier-1 sources required to fire.** The contract enforces it.
- Blocks for a defined window (e.g. 72h for an exploit).

### Anti-manipulation — mandatory
- **Astroturf ratio** — share of a mention spike from accounts <90 days old or
  posting >50×/day. **Above 40%, block any signal built on it.** A manufactured
  crowd is how retail becomes exit liquidity.
- Single-source spikes with no corroboration within 2h → **wait state, not a
  signal**.
- Assets under **$300M market cap are never traded on sentiment**.

### AI Gateway
All AI traffic passes through one gateway (Claude / OpenAI / Gemini,
interchangeable). Business logic never talks to a provider directly.

**AI may:** explain · summarise · interpret news · compare · report.
**AI may never:** change a strategy's output · override a risk decision · set
leverage · invent market data · execute a trade.

---

## 11. Notifications
Telegram · WhatsApp · Email (Discord, Slack, Push later).

- **Prime signals only, by default.**
- The message body is the **same trade instruction the UI renders**, produced by
  the same function. `apps/web/src/lib/share-signal.ts` and
  `trade-instruction.ts` are the reference; **move that formatting server-side**
  so every channel emits identical text.
- Every notification is logged with its delivery status.

---

## 12. The Ledger — the source of all trust

One table. Every signal, and what happened to it.

Record: `timestamp · asset · direction · strategies[] · entry · stop · targets ·
confidence score · calibration basis · market condition · outcome (WIN/LOSS/
BREAKEVEN) · realised R · fees · slippage · time-to-target · MFE · MAE`.

This single table feeds:
- the confidence calibration curve (§9),
- each strategy's track record and its **UNPROVEN** label,
- the auto-disable trigger,
- the measured confluence uplift (§7).

**Nothing else in the platform earns trust. This is it.**

---

## 13. Database

Prisma only. Every schema change ships a migration.

Core entities: `User` `Role` · `Exchange` `Market` `Candle` ·
**`Strategy` (the document, as JSON)** · `Signal` `SignalOutcome` ·
`RiskRejection` · `CalibrationBucket` · `RiskFlag` · `Notification` · `AuditLog`.

Note `Strategy` is **one table holding JSON documents** — built-in and custom
alike. That is the whole point of [ADR-023](adr/ADR-023-strategy-as-document.md), and it is why adding a strategy
costs a row rather than a deployment.

---

## 14. Non-negotiables (the checklist)

- [ ] Every response validated against `packages/contracts` before it ships
- [ ] Frontend computes **no** price, indicator, pattern or confidence score
- [ ] **One** strategy evaluator — built-in and custom take the same path
- [ ] Nothing skips the Risk Engine. Ever.
- [ ] Disabled strategies are inert; unproven strategies never reach Prime
- [ ] Confidence is a sum of named contributors, never a bare number
- [ ] A win rate is never shown without its basis and sample count
- [ ] Historical and live calibration are never merged behind one number
- [ ] No look-ahead bias anywhere in indicators, patterns or replay
- [ ] Every risk rejection logs its **measured** reason
- [ ] Every signal is stored permanently; none is deleted
- [ ] `HEAD_AND_SHOULDERS` is not implemented
- [ ] No `console.log`; structured logging only
- [ ] Nothing hard-codes a port, a host, `localhost`, or a secret

---

## 15. Suggested build order

1. **Contracts + Prisma + NestJS skeleton.** Health check. Docker. Deploy once,
   early, to prove the pipeline.
2. **Market module.** CCXT behind an interface (exchanges must stay
   replaceable). OHLCV into Postgres. **This unblocks everything.**
3. **Indicator engine.** Pure, tested against an oracle.
4. **Pattern engine.** Swing detection first, then structure, then geometry.
5. **Strategy evaluator.** Seed the six documents. Emit candidates.
6. **Risk Engine.** The gates, the sizing, the leverage caps, the rejection log.
7. **Signal engine.** Confluence, Prime budget, publication.
8. **Ledger.** Start recording outcomes the moment the first signal exists.
9. **Confidence engine.** Contributors. Still uncalibrated — and honest about it.
10. **Calibration.** Historical replay, then the live blend. **The UNCALIBRATED
    labels come off only here.**
11. **Notifications.** Prime only.
12. **Insights + Risk Flags.**

Steps 1–8 make the platform *work*. Steps 9–10 make it *trustworthy*. Do not
skip 10 and turn the labels off anyway — that would rebuild the exact lie this
codebase was cleaned of.

---

*The frontend is done and it is honest. Keep it that way.*
