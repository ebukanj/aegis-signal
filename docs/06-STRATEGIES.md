# Aegis Signal — Strategies

**Governed by:** [AGENTS.md](../AGENTS.md) — the constitution and ownership map.
**Owner of:** the strategy model, the vocabulary, and the six built-in strategies.
**Amended by:** [ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md) — the vocabulary, the patterns, and the rewrite.

> **Status: none of these strategies has been implemented or validated.** Every
> parameter below is a starting point to be tested, not a result that was
> measured. A strategy earns trust from its **live track record** and nothing
> else (§5).

---

## 1. A strategy is a document, not code

This is the load-bearing decision of the whole platform.

A strategy is **an instance of `StrategyDefinition`** — a JSON document owned by
`packages/contracts/src/strategy.ts`. The six built-in strategies are seeded
documents. A strategy a user invents in the builder is another document of the
same shape, stored in the same table.

So the backend implements exactly **one** thing: an evaluator that reads the
document. Not eleven bespoke plugins.

```
   ┌─────────────────────┐
   │ StrategyDefinition  │  ← built-in (seeded)  AND  user-created
   │  entry: [...]       │      identical shape, identical code path
   │  filters: [...]     │
   │  stop, targets      │
   └──────────┬──────────┘
              │
       ┌──────▼───────┐
       │ ONE evaluator│  ← the entire strategy engine
       └──────────────┘
```

[ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md) grew the **vocabulary** without touching the **architecture**. A
strategy can now say far more — MACD, KDJ, divergence, break of structure, a
bull flag — but it is still one document, read by one evaluator.

Three consequences:

1. **Adding a strategy costs nothing.** It's a row, not a deployment.
2. **Users can author strategies safely.** No code execution, no sandbox — a
   closed vocabulary means every strategy is deterministic by construction
   (Philosophy 14).
3. **The rules explain themselves.** `describeStrategy()` renders the same
   document as plain English on the Strategies page, inside a signal's "why",
   and in the Telegram alert. One vocabulary, no drift.

---

## 2. The vocabulary

A condition is either a **comparison** (`left op right`) or a **pattern**.

### Indicators

| Group | Indicators |
|---|---|
| Price | `open` `high` `low` `close` |
| Volume | `volume` `volume_sma` `obv` `cvd` `vwap` |
| Moving averages | `sma` `ema` |
| Momentum | `rsi` · **`macd_line` `macd_signal` `macd_histogram`** · `stoch_k` `stoch_d` · **`kdj_k` `kdj_d` `kdj_j`** · `cci` `williams_r` `roc` `mfi` |
| Trend | `adx` `plus_di` `minus_di` `supertrend` `psar` `ichimoku_tenkan` `ichimoku_kijun` `ichimoku_span_a` `ichimoku_span_b` |
| Volatility | `atr` · Bollinger (`bb_upper` `bb_middle` `bb_lower` `bb_width`) · Keltner · Donchian |
| Structure | `highest_high` `lowest_low` |
| Statistics | `zscore` |
| **Derivatives** | `funding_rate` `open_interest` `long_short_ratio` — **blocked on a data feed we do not have** |

### Operators

`gt` `gte` `lt` `lte` `crosses_above` `crosses_below` `between`

**`rising` / `falling`** — slope over N bars. *"MACD histogram rising for 2 bars."*

**`diverges_bullish` / `diverges_bearish`** — *price makes a lower low while RSI
makes a higher low.* Divergence is among the highest-value signals in trading and
**could not be expressed at all** before ADR-024.

### Patterns

Chart patterns cannot be said as `[indicator] [operator] [value]` — they need
swing detection and geometry — so they are a condition kind of their own.

**Market structure — objective, and the highest-value group.** It is what tells
you whether a trend is actually intact:

| Pattern | What it means |
|---|---|
| `HIGHER_HIGH_HIGHER_LOW` | An intact uptrend: each swing high and low is higher than the last |
| `LOWER_HIGH_LOWER_LOW` | An intact downtrend |
| `BREAK_OF_STRUCTURE` | Price took out the previous swing **with** the trend — it is continuing |
| `CHANGE_OF_CHARACTER` | Price broke a swing **against** the trend for the first time. The earliest evidence a trend is ending, and the most valuable |
| `LIQUIDITY_SWEEP` | Price dipped below an obvious low (taking stops) then reclaimed it. Engineered to harvest stops, not to go lower |
| `FAIR_VALUE_GAP` | An imbalance price tends to return and fill |
| `ORDER_BLOCK` | The candle that caused the last big move; large orders were left unfilled there |
| `RANGE` · `DOUBLE_TOP` · `DOUBLE_BOTTOM` | |

**Geometry — real, but a matter of degree.** Always quality-scored 0–1:

`BULL_FLAG` `BEAR_FLAG` `PENNANT` `FALLING_WEDGE` `RISING_WEDGE`
`ASCENDING_TRIANGLE` `DESCENDING_TRIANGLE`

### Deliberately absent
**Head & shoulders. Cup & handle. Elliott waves.**

Ten traders draw them ten different ways. A deterministic detector for them would
be *inventing certainty* — and inventing certainty is the one thing this platform
exists not to do. The schema **rejects them**, and a test asserts it.

### Exits
The stop is `atr`, `percent`, or `structure`. Targets are expressed in **R** —
multiples of the distance to the stop — so a target is always stated relative to
the risk taken to reach it. Targets may not close more than 100% of the position.

---

## 3. The six strategies

Plain trader English. A name should tell you what the rule looks for.

### Breakout · perpetual · 1h
*Price escapes a quiet range on heavy volume — the move that follows a squeeze.*

- price is above the highest high (20)
- volume is at least 1.5× average volume (20)
- **the MACD histogram has been rising for 2 bars** — momentum must be *turning*, not merely high. A histogram already rolling over is a breakout about to fail.
- RSI (14) is between 55 and 75
- **a break of structure has formed** — the trend is genuinely continuing

*Only if:* price above the 4h EMA(200) · 4h ADX ≥ 18 · **Bollinger inside Keltner** (the squeeze — expansion follows compression)
*Stop* 1.2× ATR · *Targets* +1.5R (50%), +3R (50%) · Risk 1% · ≤ 3×

### Trend Pullback · spot · 4h
*Buy the dip inside a confirmed uptrend — join strength, don't chase it.*

- **uptrend structure is intact (HH/HL)** — not merely "above a moving average", which lags and lies at exactly the wrong moment
- price is at most the EMA(21)
- Stochastic %K crosses above %D
- RSI (14) crosses above 50

*Only if:* daily EMA(21) > EMA(200) · daily price > EMA(200) · **a bull flag (60% clean)** — what a healthy pullback actually looks like
*Stop* structural, 20 bars · *Targets* +2R, +4R · Risk 1.5% · no leverage

### Reversal · perpetual · 1h
*Fade a move that went too far, too fast — snap back toward the average.*

- price is below the lower Bollinger Band (20)
- Z-score (20) at most −2.2
- **RSI (14) shows bullish divergence over 20 bars** ← *the one that matters.* Price makes a lower low; RSI makes a higher low. The selling is exhausted even though the price says otherwise.
- **a liquidity sweep has formed** — the stops below were taken and reclaimed

*Only if:* 4h ADX < 20 (only fade inside a range — fading a trend is how accounts die) · volume ≥ 2× average
*Stop* 1.0× ATR · *Targets* +1.2R (60%), +2R (40%) · Risk 0.75% · ≤ 2×

### Level Bounce · perpetual · 15m
*Price rejects a level that has held before.*

- **an order block has formed** — the candle that caused the last move, where large orders were left unfilled
- price closes back above the lowest low (50)
- volume ≥ 1.3× average
- **cumulative volume delta rising for 3 bars** — buyers absorbing the selling. CVD rising while price is flat is the footprint of accumulation.

*Only if:* 1h EMA(50) below 1h price
*Stop* 0.5× ATR · *Targets* +1R, +2R · Risk 0.5% · ≤ 5×

### Pattern Break · perpetual · 4h  ·  **NEW**
*A clean chart pattern completes and price breaks out of it.*

- **a falling wedge has formed (at least 75% clean)** — a half-formed wedge is a Rorschach test, not a trade
- price is above the highest high (10)
- volume ≥ 1.4× average
- the MACD line crosses above the MACD signal line

*Only if:* daily ADX ≥ 20
*Stop* structural, 10 bars · *Targets* +2R, +4R · Risk 1% · ≤ 3×

### Crowd Squeeze · perpetual · 4h · **disabled by default**
*Everyone is on one side, paying to stay there, and price has stopped rewarding them.*

- funding rate ≥ 0.08% · open interest rising 5 bars · long/short ratio ≥ 1.8
- **a change of character has formed** — the first crack in the trend
- price crosses below the EMA(21)

> Ships **off**: it needs funding, open interest and long/short ratio — a
> derivatives feed the platform does not have. Switching it on would be
> pretending to measure something we cannot see.

---

## 4. Confidence is earned, never asserted

The score is the **sum of named contributors**, each carrying its weight, its
source, and the value it was measured from. Every signal shows the arithmetic.

**A score is not a win rate.** Turning one into the other requires evidence, from
three sources in rising order of trust ([ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)):

| Source | Available | Trust |
|---|---|---|
| Historical replay over exchange candles | Day one | Real, but optimistic |
| The live ledger — our own settled signals | Accumulates | The truth |
| A blend, shrinking toward live as results arrive | Always | What we display |

Until there is evidence, a signal reads **"Score 91 · Uncalibrated"** and says so
plainly. Historical and live are **never merged behind one unlabelled number** —
the `CalibratedConfidence` contract makes that structurally impossible.

---

## 5. Trust comes from the live record, not a backtest

There is no backtesting laboratory ([ADR-023](adr/ADR-023-strategy-as-document.md)). What the platform keeps is the
**track record** — one ledger, recording every signal's outcome:

- Each strategy shows `signals · wins · avg R · expectancy`, or honestly:
  **UNPROVEN — no track record yet.**
- **An unproven strategy may emit signals, but never a Prime one.** The daily
  4–5 Prime budget ([ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md)) is reserved for rules that have earned it.
- **A disabled strategy is inert.** It cannot fire, cannot be a confluence
  partner, and cannot reach Prime ([ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)).
- A strategy whose rolling expectancy turns negative **auto-disables**.

---

## 6. Platform services — not strategies

| Was | Is now |
|---|---|
| **Chameleon** | The **regime filter**. Invisible plumbing: it switches Breakout off in a sideways market and Reversal off in a trending one. |
| **Oracle** | Split in two: the **Insights** page (news, social, fundamentals), and a **Risk Flag** that blocks every signal on a coin just hacked or depegged. A veto belongs to the Risk Engine, never to a strategy. |
| **Relay / Harvest** | **Deleted.** Rotation and funding carry are not trades. Neither says *"here is a trade worth taking right now."* |

---

## 7. Universal gates

Applied before **any** strategy fires, built-in or custom:

1. 24h quote volume ≥ **$50M** (liquidity — prevents slippage and manipulation)
2. Spread ≤ **0.05%** of price
3. No signal within **15 minutes** of a tier-1 macro event (FOMC, CPI)
4. No active **Risk Flag** on the asset
5. Confidence ≥ **75**. Below that it may be logged, never alerted.
6. **Prime** requires confidence ≥ **88**, an enabled and proven strategy, and a
   free slot in the day's budget of ~5.

Position size always follows from the stop, never from the leverage:

```
PositionSize = (Equity × riskPercent) / |Entry − Stop|
```

Leverage only determines margin efficiency. **It never determines risk.**

---

*Engineering blueprints, not financial advice. Every parameter here must be
validated on live signals before it is trusted. Leveraged trading can lose more
than you deposit.*
