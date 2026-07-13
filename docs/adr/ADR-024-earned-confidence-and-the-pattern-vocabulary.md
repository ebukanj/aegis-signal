# ADR-024 — Earned Confidence, the Indicator & Pattern Vocabulary, and Inert Disabled Strategies

**Status:** Accepted (plan — not yet implemented)
**Date:** 2026-07-13
**Extends:** [ADR-023](ADR-023-strategy-as-document.md) (a strategy is a document), [ADR-021](ADR-021-confluence-prime-signals-execution-guidance.md) (confluence, Prime budget)
**Amends:** [06-STRATEGIES](../06-STRATEGIES.md) §2 (vocabulary), §3 (the five strategies), §4 (how trust is earned)

---

## Context

Three problems, found by reading the running code rather than the docs.

### 1. The confidence score is fabricated

```ts
confidence = Math.min(97, randInt(rand, 52, 92) + (strategies.length - 1) * 4);
```

A random number, plus a flat +4 for every extra strategy that agrees. When the
UI renders **"91%"**, it means nothing at all. This is precisely what
[06-STRATEGIES](../06-STRATEGIES.md) warned against — *"a bot printing '94%' decoratively"* — and it is
the single largest integrity hole in the platform.

The owner's instruction was exact: *"if you say ninety-one, I want you to watch
that ninety-one."*

### 2. Disabling a strategy does nothing

`useStrategyStore` is read by the Strategies page and by nothing else. Signals,
the Prime budget and confluence all still enumerate `BUILT_IN_STRATEGIES`. A
user can switch Reversal off and it will keep producing Prime signals. The
toggle is decoration.

### 3. The vocabulary is too thin to compete

21 indicators, no MACD, no Stochastic, no KDJ, **no divergence**, and no way to
express market structure or a chart pattern at all. A falling wedge, a bull
flag, a break of structure — none of it is sayable. Competing products
(Bybit TradeGPT et al.) combine far more.

---

## Decision

### 1. Confidence is measured, then calibrated, and never asserted

Separate two things that were conflated:

- **The evidence is real from day one.** Every contributor is arithmetic on
  exchange candles — *volume 2.3× its 20-bar average*, *RSI 68*, *bull flag,
  quality 0.81*. None of it needs a track record.
- **Only the leap from score → probability needs history.** "91 means you win
  91% of the time" is a claim about *outcomes*, and no amount of live market
  data proves it.

So the score is built from **named contributors with stated weights**, and every
signal shows its arithmetic:

```
Base — Breakout's win rate in an uptrend      52   (from 340 logged setups)
+ Confluence — Level Bounce agrees            +9   (measured, not assumed)
+ Volume 2.3× average (needed 1.5×)           +6
+ 4h trend aligned                            +5
+ Bull flag, quality 0.81                     +7
− Resistance 0.8 ATR above entry              −8
──────────────────────────────────────────────────
Raw score                                      71
```

Then that raw score is **calibrated against outcomes**, from three sources in
rising order of trust:

| Source | Available | Trust |
|---|---|---|
| **Historical prior** — replay each strategy over exchange OHLCV | Day one | Real, but optimistic |
| **Live ledger** — our own settled signals | Accumulates | The truth |
| **Blend** — prior shrinking as live results arrive | Always | What we display |

The blend is a Beta prior with shrinkage: start on history, and each live
outcome pulls the number toward reality. After roughly 30 live signals for a
score bucket, live dominates and history is dropped.

The display evolves honestly:

```
Day 1    Score 91 · 61% historical   (2yr replay, 1,284 setups — no live results yet)
Day 30   Score 91 · 66%              (blend: 1,284 historical + 11 live)
Day 90   Score 91 · 87% live         (34 live signals — history no longer used)
```

**Historical and live are never silently merged into one number.** The Track
Record page shows them side by side with a reliability chart — *"when we say 90,
we are right 87% of the time"*. If the line bends off the diagonal, the scorer
is lying and must be retuned. That chart is the platform's integrity, on display.

### 2. Historical calibration is an engine, not a workspace

[ADR-023](ADR-023-strategy-as-document.md) deleted the Backtesting Laboratory because traders validate in
TradingView, and that stands. This is a different thing: a **background job the
user never operates**, existing only so the number on a signal means something
on day one. There is no Backtesting page and there will not be one.

**Accepted risk:** a hit rate measured on the same candles the rules were tuned
on is optimistic. That is how signal products lie to themselves. Guards:
walk-forward (calibrate on older data, validate on newer), and never merging
historical with live behind a single unlabelled percentage.

### 3. Disabled means inert, everywhere

- Signals, the Prime budget and confluence read the **strategy store**,
  enabled-only.
- A disabled strategy cannot fire, cannot contribute to a Prime signal, and
  cannot appear as a confluence partner.
- The **Scanner may still explore** with a disabled strategy — that is what a
  tool is for — but those results are labelled *"exploration — not eligible for
  Prime"*.
- **UNPROVEN strategies remain barred from Prime** ([ADR-023](ADR-023-strategy-as-document.md) §4).

### 4. The vocabulary grows; the architecture does not

A strategy remains a document evaluated by one evaluator ([ADR-023](ADR-023-strategy-as-document.md)). What
grows is what a document may *say*.

**Indicators** — added in tiers:

| Tier | Indicators |
|---|---|
| 1 · momentum | MACD (line/signal/histogram), Stochastic (%K/%D), KDJ (K/D/J), CCI, Williams %R, ROC, MFI |
| 2 · trend | Supertrend, Ichimoku (tenkan/kijun/cloud), Parabolic SAR, DMI (+DI/−DI), MA cross |
| 3 · volume | OBV, CVD (cumulative volume delta), anchored VWAP, Volume Profile (POC/VAH/VAL) |
| 4 · volatility | Keltner, Donchian, historical volatility |
| 5 · derivatives | long/short ratio, liquidations, predicted funding — **ships disabled, needs a feed** |

**Operators** — three additions, one of them essential:

- **`diverges`** — *price makes a lower low while RSI makes a higher low.*
  Divergence is among the highest-value signals in trading and **cannot be
  expressed at all today**.
- **`rising` / `falling`** — slope over N bars ("MACD histogram rising 3 bars").

**Patterns** — a new operand kind. Chart patterns are not expressible as
`[indicator] [operator] [value]`; they need swing detection and geometry:

```ts
{ kind: "pattern", pattern: "BULL_FLAG", minQuality: 0.7, timeframe: "4h" }
```

The backend gains a **pattern library** of deterministic detectors, each
returning *detected + quality 0–1*. A user can then drop *"bull flag detected"*
into any strategy. **One evaluator still.**

Which patterns ship, and — importantly — which do not:

| Objective — ship | Tunable — ship with a quality score | **Rejected** |
|---|---|---|
| Swing highs/lows · **HH/HL/LH/LL** · **Break of Structure** · **Change of Character** · Double top/bottom · Range · Liquidity sweep · Fair value gap · Order block | Bull/bear flag · Pennant · Falling/rising wedge · Ascending/descending triangle | **Head & shoulders** · **Cup & handle** · Elliott waves |

The rejected column is subjective — ten traders draw them ten different ways. A
deterministic detector for them would be *inventing* certainty, and inventing
certainty is the thing this platform exists not to do.

**Market structure (HH/HL, BOS, CHoCH) is the highest-value item on the list**
and is entirely absent today. It is what tells you a trend is actually intact.

### 5. The five strategies are rewritten, and a sixth is added

The current five carry three conditions each. They are thin and will
underperform.

| Strategy | Gains |
|---|---|
| **Breakout** | MACD histogram rising · Break of Structure · squeeze (Bollinger inside Keltner) · resistance-proximity penalty |
| **Trend Pullback** | HH/HL structure intact · Stochastic reset · Fibonacci 0.382–0.618 zone · bull-flag detection |
| **Reversal** | **RSI divergence** · volume climax · liquidity sweep · double-bottom |
| **Level Bounce** | order block / fair-value-gap confluence · CVD absorption · rejection-wick quality |
| **Crowd Squeeze** | long/short ratio · OI divergence *(stays disabled — needs the derivatives feed)* |
| **Pattern Break** *(new)* | Fires purely on high-quality chart patterns: flags, wedges, triangles, double tops/bottoms |

### 6. Confluence uplift is measured, not invented

Today: `+4 points per extra agreeing strategy`. Invented.

Instead: derived from the ledger. If Breakout + Level Bounce agreeing
historically won 64% against Breakout's 52% alone, the uplift is **+12**. Until
there is data, **the uplift is zero** and the signal states *"2 strategies agree
— uplift not yet calibrated."*

---

## Alternatives considered

- **Keep the random confidence, add a breakdown.** Rejected: a visible
  breakdown of a fabricated number is a more sophisticated lie.
- **Show no number until live data exists.** Rejected on the owner's challenge:
  exchange history is free and real, and a new user staring at "UNCALIBRATED"
  for six weeks learns nothing. The historical prior is honest *if labelled*.
- **Detect head & shoulders and cup & handle.** Rejected: subjective. Would be
  manufacturing certainty.
- **Express patterns as indicator conditions.** Rejected: geometrically
  impossible. Hence the new operand kind.

## Consequences

**Positive**
- The confidence number becomes a claim the platform can defend, and the
  reliability chart makes any lie visible.
- The vocabulary becomes competitive without a second code path — patterns and
  indicators are new *words*, not new architecture.
- The strategy toggle finally does something.

**Negative / accepted**
- Historical calibration is optimistic by nature; walk-forward and separate
  reporting are the mitigation, not a cure.
- The pattern library is real engineering (swing detection, trendline fitting)
  and is the largest single item here.
- Tier-5 derivatives indicators cannot ship until a data feed exists.

## What is frontend work, and what the backend must own

We are still on the frontend ([AGENTS.md](../../AGENTS.md) §4 — `apps/api` does not exist). None
of the maths below can be *computed* here: the frontend renders, it never
decides ([AGENTS.md](../../AGENTS.md) §6). So this ADR is built in two halves, and the frontend half
exists precisely to **lay the foundation the backend then fills**.

### Frontend now — the contract, the shapes, the surfaces

| Deliverable | Where | Why it is frontend work |
|---|---|---|
| Indicator + operator vocabulary (tiers 1–5, `diverges`, `rising`, `falling`) | `packages/contracts` | The contract is the shared definition. The backend imports the same enum it evaluates. |
| `pattern` operand kind + the pattern enum | `packages/contracts` | Same. A pattern is a *word in the language*, and the language is the contract. |
| `ConfidenceContributor` with `weight`, `source`, `measured` | `packages/contracts` | The breakdown's shape is an API contract. The backend fills it; the panel renders it. |
| `CalibratedConfidence` — raw score, historical rate, live rate, sample sizes, which one is being displayed | `packages/contracts` | The **most important shape in this ADR.** It makes it structurally impossible for the API to send a probability without saying where it came from. |
| The rewritten 5 + Pattern Break, as documents | `constants/strategies.ts` | Seeds. They are data, not code (ADR-023) — the backend loads them. |
| Confidence breakdown UI · uncalibrated labelling · reliability chart · "exploration, not Prime" badge | `apps/web` | The surfaces that make the honesty visible. |
| Disabled strategies inert across Signals, Prime and confluence | `apps/web` | Fix the decoration bug in the mock pipeline *and* the store wiring, so the behaviour is already correct when the API arrives. |
| Mocks reshaped to the new contract | `apps/web` | Mocks must lie in the *shape* of the truth, never in its place. |

### Backend later — the engines, recorded now so they are not forgotten

Appended to [BACKEND_NOTES](../BACKEND_NOTES.md):

1. **Indicator engine** — computes every tier-1–4 indicator from OHLCV. Pure,
   deterministic, unit-testable against known reference values.
2. **Pattern engine** — swing detection → structure (HH/HL, BOS, CHoCH) →
   geometric patterns (flag, wedge, triangle) with a quality score 0–1.
3. **Confidence engine** — scores contributors by their stated weights, emits
   the full breakdown, never a bare number.
4. **Calibration job** — replays strategies over exchange OHLCV for the
   historical prior; ingests the live ledger; blends with Beta shrinkage;
   publishes the reliability curve. Walk-forward guarded.
5. **The evaluator** — one function, reading a `StrategyDefinition`, calling the
   indicator and pattern engines. Still exactly one (ADR-023).

**The rule that keeps this honest:** the frontend must never compute a
confidence score, a pattern, or an indicator. If it can be faked in `apps/web`,
it will be — and a faked number here is how we got a random 91% in the first
place. The mock data may *contain* these values; no component may *derive* them.

## Implementation order

1. **Kill the lie** — disabled strategies inert; confidence rendered as
   uncalibrated with its contributor breakdown. *Fastest, most important.*
2. **Contract** — the new vocabulary, the `pattern` operand, `CalibratedConfidence`.
3. **Rewrite the five, add Pattern Break** (as documents).
4. **Editor** — pattern and indicator conditions in the builder.
5. **Track Record** — the reliability chart; historical vs live, side by side.
6. **Backend** — the four engines above, against a contract that already exists.
