# Aegis Signal — Strategies

**Governed by:** [AGENTS.md](../AGENTS.md) — the constitution and ownership map.
**Owner of:** the strategy model and the five built-in strategies.
**Supersedes:** Strategy Module Specifications v1.0/v1.1/v1.2 (11 codenamed modules), retired by [ADR-023](adr/ADR-023-strategy-as-document.md).

> **Status: none of these strategies has been implemented or validated.** Every
> parameter below is a starting point to be tested, not a result that was
> measured. A strategy earns trust from its **live track record** and nothing
> else (§4).

---

## 1. A strategy is a document, not code

This is the load-bearing decision of the whole platform.

A strategy is **an instance of `StrategyDefinition`** — a JSON document owned by
`packages/contracts/src/strategy.ts`. The five built-in strategies are seeded
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

Three consequences:

1. **Adding a strategy costs nothing.** It's a row, not a deployment.
2. **Users can author strategies safely.** No code execution, no sandbox, no
   security hole — a closed vocabulary of indicators and operators means every
   strategy is deterministic by construction (Philosophy 14).
3. **The rules explain themselves.** `describeStrategy()` renders the same
   document as plain English on the Strategies page, inside a signal's "why",
   and in the Telegram alert. One vocabulary, no drift.

### The honest limit
This vocabulary expresses **price, volume, indicator, funding and open-interest**
conditions. It **cannot** express news sentiment or liquidation-cascade
detection. Those are not strategies — they are **platform services** (§5). Do
not stretch the schema to cover them.

---

## 2. The vocabulary

A condition is `left <operator> right`. Nothing else.

**Operands** — a fixed number, or an indicator (with optional `period`,
`timeframe` and `multiplier`, so a 1h strategy can ask "is the 4h trend up?"):

| Group | Indicators |
|---|---|
| Price | `open` `high` `low` `close` |
| Volume | `volume` `volume_sma` |
| Trend | `sma` `ema` `adx` |
| Momentum | `rsi` |
| Volatility | `atr` `bb_upper` `bb_middle` `bb_lower` `bb_width` |
| Structure | `highest_high` `lowest_low` `vwap` |
| Derivatives | `funding_rate` `open_interest` |
| Statistics | `zscore` |

**Operators:** `gt` `gte` `lt` `lte` `crosses_above` `crosses_below` `between`

**Exits.** The stop is `atr` (multiple of ATR), `percent`, or `structure`
(beyond the last N bars' extreme). Targets are expressed in **R** — multiples of
the distance to the stop — so a target is always stated relative to the risk
taken to reach it. Targets may not close more than 100% of the position.

**Risk.** `riskPercent` of equity per trade, and `maxLeverage` (null for spot).
The Risk Engine may lower these; it may never raise them.

---

## 3. The five strategies

Plain trader English. A name should tell you what the rule looks for.

### Breakout · perpetual · 1h
*Price escapes a quiet range on heavy volume — the move that follows a squeeze.*

Enter LONG or SHORT when **all** of:
- price is above the highest high (20)
- volume is at least 1.5× average volume (20)
- RSI (14) is between 55 and 75

Filters: price above the EMA (200) on the 4h · ADX (14) on the 4h is at least 18
Stop: 1.2× ATR (14) · Targets: +1.5R (50%), +3R (50%) · Risk 1% · ≤ 3×

### Trend Pullback · spot · 4h
*Buy the dip inside a confirmed uptrend — join strength, don't chase it.*

Enter LONG when **all** of:
- price is at most the EMA (21)
- RSI (14) crosses above 50

Filters: daily EMA (21) above daily EMA (200) · daily price above daily EMA (200)
Stop: structural, last 20 bars · Targets: +2R (50%), +4R (50%) · Risk 1.5% · no leverage

### Reversal · perpetual · 1h
*Fade a move that went too far, too fast — snap back toward the average.*

Enter LONG or SHORT when **all** of:
- price is below the lower Bollinger Band (20)
- Z-score (20) is at most −2.2
- RSI (14) crosses above 30

Filters: ADX (14) on the 4h is below 20 *(only fade when there is no trend)*
Stop: 1.0× ATR (14) · Targets: +1.2R (60%), +2R (40%) · Risk 0.75% · ≤ 2×

### Level Bounce · perpetual · 15m
*Price rejects a level that has held before — trade the bounce off proven support or resistance.*

Enter LONG or SHORT when **all** of:
- the low is at most the lowest low (50)
- price closes back above the lowest low (50)
- volume is at least 1.3× average volume (20)

Filters: 1h EMA (50) below 1h price *(never catch a falling knife)*
Stop: 0.5× ATR (14) · Targets: +1R (50%), +2R (50%) · Risk 0.5% · ≤ 5×

### Crowd Squeeze · perpetual · 4h · **disabled by default**
*Everyone is on one side, paying to stay there, and price has stopped rewarding them.*

Enter LONG or SHORT when **all** of:
- funding rate is at least 0.08%
- open interest is at a 30-period high
- price crosses below the EMA (21)

Stop: structural, last 12 bars · Targets: +1.5R (40%), +3R (60%) · Risk 1% · ≤ 2×

> Ships **disabled**: it needs a derivatives data feed (funding, open interest)
> that does not exist yet. Enable it when the feed does.

---

## 4. Trust comes from the live record, not a backtest

There is no backtesting laboratory ([ADR-023](adr/ADR-023-strategy-as-document.md)). Traders validate on TradingView
or on a live exchange, with better tools than we would ever build.

What the platform keeps instead is the **track record** — one ledger, recording
every signal's outcome:

- Each strategy shows `signals · wins · avg R · expectancy`, or honestly:
  **UNPROVEN — no track record yet.**
- **An unproven strategy may emit signals, but never a Prime one.** The daily
  4–5 Prime budget ([ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md)) is reserved for rules that have earned it.
- A strategy whose rolling expectancy turns negative **auto-disables**.

This is what makes a confidence score mean something. Without it, "87%" is
decoration — and a bot printing decorative percentages is precisely what Aegis
Signal is not ([01-PRODUCT_BIBLE](01-PRODUCT_BIBLE.md) §5).

---

## 5. Platform services — not strategies

Three things from the old 11-module spec survive, but **not** as strategies:

| Was | Is now |
|---|---|
| **Chameleon** (meta-engine) | The **regime filter**. Invisible plumbing: it switches Breakout off in a ranging market and Reversal off in a trending one. Not a toggle, not a page. |
| **Oracle** (social/fundamental) | Split in two: the **Insights** tab (news, coin updates, AI market summaries), and a **Risk Flag** that blocks every signal on a coin that was just hacked, exploited or depegged. |
| **Relay / Harvest** | **Deleted.** Portfolio rotation and delta-neutral funding carry are not trades. Neither one says *"here is a trade worth taking right now"* — they fail the test in [AGENTS.md](../AGENTS.md) §1. |

The Risk Flag deserves emphasis: it is pure *"Protect the Trader."* It should
never have been a strategy — it is a veto, and vetoes belong to the Risk Engine.

---

## 6. Universal gates

Applied before **any** strategy fires, built-in or custom:

1. 24h quote volume ≥ **$50M** (liquidity — prevents slippage and manipulation)
2. Spread ≤ **0.05%** of price
3. No signal within **15 minutes** of a tier-1 macro event (FOMC, CPI)
4. No active **Risk Flag** on the asset (§5)
5. Confidence ≥ **75**. Below that it may be logged, never alerted.
6. **Prime** requires confidence ≥ **88**, a proven strategy, and a free slot in
   the day's budget of ~5 ([ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md)).

Position size always follows from the stop, never from the leverage:

```
PositionSize = (Equity × riskPercent) / |Entry − Stop|
```

Leverage only determines margin efficiency. **It never determines risk.**

---

*Engineering blueprints, not financial advice. Every parameter here must be
validated on live signals before it is trusted. Leveraged trading can lose more
than you deposit.*
