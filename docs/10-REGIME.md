# The Market Regime Engine

> Indicators describe the market. Patterns describe its structure.
> **The Regime Engine says what environment the market is in.**

A strategy that prints money in a trend gets shredded in a range, and the difference
is the environment's fault rather than the strategy's. So no strategy is evaluated
without this.

---

## 1. Two axes, because one label was never enough

The brief asked for ten regimes, *"mutually exclusive at a given timeframe"*: Bull
Trend, Bear Trend, Sideways, Transition, High Volatility, Low Volatility, Breakout,
Breakdown, Expansion, Compression.

**They are not mutually exclusive.** A market ripping upward on 3× normal range is a
bull trend **and** it is high volatility. Both are true. Forcing a single winner means
the classifier must rank *"is this bull, or is this volatile?"* — a question with no
principled answer, so whatever tiebreak it used would be a rule somebody invented,
presented as a measurement.

| Axis | Values |
|---|---|
| **DIRECTION** | `TRENDING_BULL` · `TRENDING_BEAR` · `RANGE` · `TRANSITION` · `RISK_OFF` |
| **VOLATILITY** | `COMPRESSED` · `NORMAL` · `EXPANDED` |

Both are always true at once. *"TRENDING_BULL, EXPANDED"* is a sentence that is true;
"Bull Trend" alone throws away the half the Risk Engine most needs — the correct
response to expanded volatility is a **wider stop and a smaller position**, and a
direction label gives it no way to know.

### What is deliberately absent

**Breakout and Breakdown.** The Pattern Engine already emits them
(`BREAK_OF_STRUCTURE`, `RANGE`, `LIQUIDITY_SWEEP`). Re-minting them as regimes would
mean the same evidence arriving twice under two names — and Confluence counting it
twice. M05 ended with exactly that warning.

### RISK_OFF is not "a strong bear trend"

`TRENDING_BEAR` is **tradeable** — you short the rallies. `RISK_OFF` is not: the
rallies are 8% and they eat you, levels stop holding, and stops fill far from where
they were placed. A platform that cannot tell them apart keeps trading through the
one week it should have stood aside.

---

## 2. `agreement` is NOT a probability, and never will be

The brief asked for **"Probability: 91%"**. That is the same 91% this platform already
killed once (ADR-024).

A probability is a **falsifiable** claim: *"when I say 91%, I am right 91% of the
time."* You can check it. You can plot it. You can be caught lying by it.

**There is no ground truth for a market regime.** Nobody can tell you what regime the
market "really" was in on 14 March — there is no oracle, no settlement, no resolved
outcome. So a regime probability is not merely *uncalibrated*; it is
**unfalsifiable by construction**. It could never be checked, so it could never be
wrong, so it means nothing.

What *can* be said honestly is **how much of the evidence agrees**:

```
agreement: 0.78          ← the share of weighted evidence backing the verdict
calibration: "UNCALIBRATED"   ← a literal. It has no other possible value.
supporting:    [ trend, momentum, structure ]
contradicting: [ volume — "volume is only 0.6× its recent average" ]
```

`calibration` is a **literal type**, not a boolean, so anything rendering a regime has
to acknowledge it exists. A `calibrated: false` flag is a thing people forget to
check; a field whose only possible value is the word `UNCALIBRATED` is not.

### The contradictions are worth more than the label

Every feature returns a **signed** score (−1 … +1), so a voter can *disagree*. An
engine built from voters that can only confirm will classify a market as bullish and
quietly discard the volume that has been collapsing for six bars — and the collapsing
volume is the single most useful thing it knows.

---

## 3. The five voters

| Feature | Weight | What it alone can see |
|---|---|---|
| **Trend** | 30% | EMA stack, DI balance, scaled by ADX |
| **Structure** | 25% | HH/HL, break of structure, **change of character** |
| **Momentum** | 20% | RSI, MACD histogram *and its slope* |
| **Volume** | 20% | Participation — the only voter not reading price |
| **Volatility** | 5% | Expansion asymmetry (small here; it owns an axis) |

Weights are configurable and **checked at boot to sum to exactly 1**. Weights summing
to 0.9 do not fail — they silently compress every agreement score in the platform by
10%, and no test would ever catch it.

Three deliberate choices:

- **ADX is a magnitude, never a direction.** A roaring collapse and a roaring rally
  both print ADX 40. It *scales* the opinion the EMA stack and DI balance have already
  formed — it is the volume knob, not the song.
- **Volume is weighted equal to momentum.** Trend, momentum and structure all read
  *price*; volume is the only voter reading *participation*. When it dissents — a rally
  on collapsing volume — it is usually right.
- **A feature that cannot see does not vote, and its weight is NOT redistributed.** A
  classification built on two of five features has a correspondingly weak `agreement`.
  Renormalising would manufacture confidence from a market half-examined.

---

## 4. Hysteresis — a regime that flips every bar is not a regime

A naive classifier thresholds the consensus and is done. It reads TRENDING_BULL at
+0.31, RANGE at +0.29, TRENDING_BULL at +0.31 — three "regime changes" from a market
that did nothing, each publishing an event, each re-permissioning every strategy on the
platform.

That is not a classifier. It is a coin flip with a threshold.

Two mechanisms:

1. **A threshold band.** Entering a trend needs consensus ≥ 0.15; staying in one needs
   only ≥ 0.04. A trend does not end because it paused.
2. **A dwell.** A challenger must win **4 bars running** before it takes the crown. One
   bad bar in a bull market is a bad bar, not a regime change.

`RISK_OFF` **bypasses the dwell.** Making a crash wait four bars for confirmation is
four bars too late — that is the entire move. Hysteresis exists to stop the engine
chattering, not to make it slow to notice the building is on fire.

**TRANSITION** exists because a market that has ranged for two weeks and a market that
fell out of a trend six bars ago look identical to a threshold and are completely
different places to trade. Mean reversion works in the first and gets run over in the
second, because the trend is not finished with you yet.

---

## 5. Multi-timeframe

`alignment` — how much every timeframe agrees, weighted by **authority** (the daily
counts for 8× the 15m).

`conflict` — how much the **higher** timeframes contradict the primary one.
Deliberately *not* `1 − alignment`: a 15m that disagrees with the daily is noise; a
daily that disagrees with the 15m is a warning, and collapsing them into one symmetric
number throws away the only part that matters.

**Only timeframes above the primary can create conflict.** A lower timeframe
disagreeing is not a conflict — it is a **pullback**, and pullbacks are where entries
live.

> A 15-minute bull signal inside a 4-hour downtrend is a **bounce** — the most expensive
> trade in retail. It looks perfect right up until the higher timeframe reasserts
> itself. That trade is not defeated by a better entry. It is defeated by *looking up*.

---

## 6. Strategy compatibility is DECLARED, never inferred

The obvious implementation is a `regime → strategy` lookup table inside the engine. It
is faster to write and it **breaks the one rule ADR-023 exists to protect**: a strategy
is a document, and a user-created one takes the identical code path as a built-in.

A strategy the engine has never heard of could never appear in a hardcoded map. So
every user-authored strategy would be permanently invisible to the filter — or, worse,
silently treated as compatible with everything.

So each strategy **declares** its own environments, and the engine only reads them:

```ts
regimes:      ["TRENDING_BULL", "TRENDING_BEAR"],   // where it belongs
avoidRegimes: ["RANGE", "RISK_OFF"],                // where it is DANGEROUS
```

These are different claims. *"I work in a trend"* is a preference; *"I am actively
dangerous in a range"* is a **veto**, and the veto wins. A mean-reversion strategy in a
strong trend does not merely underperform — it sells every new high, all the way up.

An empty `regimes` list means **no restriction**, and that is the honest default for a
brand-new strategy the platform knows nothing about.

The engine **exposes** compatibility. It never executes anything.

---

## 7. Historical replay — and the four bugs it found

Synthetic markets prove the classifier can read a market it was *designed* to read.
That is worth little: I wrote both the market and the classifier, so of course they
agree.

So it is replayed, **bar by bar**, against real Binance daily candles:

| Fixture | Reality | Verdict |
|---|---|---|
| `BULL_2021` | Oct 2020 → Apr 2021, **+493%** | **TRENDING_BULL 67%** |
| `BEAR_2022` | Apr → Jul 2022, **−57%** | **TRENDING_BEAR 88%** |
| `SIDEWAYS_2020` | May → Jul 2020, +9% in a 28% band | **RANGE 100%** |
| `CRASH_2020` | COVID, **−34%** | TRENDING_BEAR 63%, **RISK_OFF 38%** |

Every one of these bugs was invisible to the synthetic tests, and every one would have
cost money.

### Bug 1 — RISK_OFF was dead code during a crash

The volatility baseline needed 80 bars of ATR. The COVID fixture is 48 candles, so the
baseline returned `null` on **every single bar** — and `RISK_OFF` could never evaluate,
during the fastest crash in the asset's history. The baseline now adapts.

*(Same class of error as the Pattern Engine's order block: a threshold measured against
a baseline the event had already contaminated. The baseline must sit **outside** the
event, and it is a **median**, because a mean is dragged upward by the very spike it is
trying to detect — it would quietly raise its own bar.)*

### Bug 2 — the heaviest voter never voted

The trend extractor demanded **both** EMA(50) and EMA(200). EMA(200) needs 200 bars.
The bull fixture is 196.

So across the greatest bull market in the asset's history, the 30%-weighted trend
feature **never voted once**. Nothing errored. Nothing warned. And it was not a test
artefact — *any* daily chart younger than 200 days has this, which is every newly
listed coin the platform will ever scan.

A feature must vote with what it *can* see and **say what it could not**. It now
returns `null` only when it can see nothing at all.

### Bug 3 — RISK_OFF fired on 15% of a bull market

It required only two things: volatility expanding, and price down 6% in ten bars. Both
happen **regularly** inside a healthy bull market — the 2020-21 run had several 20%
corrections.

`RISK_OFF` is the platform's stand-down signal. The engine would have sat out the best
buying opportunities of the entire run, *confidently*. It now also requires **the
weighted evidence to have turned negative**. A sharp dip is not a collapse; a collapse
is a fast fall in a market whose evidence has broken.

### Bug 4 — the threshold was a guess, and it hid a missing feature

The entry threshold was 0.30, chosen on the reasoning that "a clear majority of the
evidence should point one way". Sound reasoning; wrong number. Across the +493% run,
**every voter was bullish** — trend +0.33, momentum +0.28, structure +0.19 — and the
weighted consensus was **+0.21**. Signed features spend most of their time near the
middle even in a raging trend, because most individual bars are unremarkable even
inside a great year.

But lowering it to 0.15 then made the flat mid-2020 chop read as `TRENDING_BEAR` **67%
of the time**. Tuning could not fix both — catching the trend caught the chop; rejecting
the chop lost the trend.

**That is the signature of a missing feature, not a mis-set number**, and no amount of
tuning would ever have found it.

The missing feature was **ADX** — the one indicator that measures trend *strength*
without regard to direction:

```
2021 bull market      mean ADX 37.9
2022 bear market      mean ADX 42.1
mid-2020 chop         mean ADX 21.9   ← the discriminator
```

A market may now only **enter** a trend if it can prove there is one (ADX ≥ 25 — the
conventional line, and one this data supports). Below that there is *a direction but
not a trend* — the exact sentence the trend extractor was already printing while the
classifier ignored it.

The gate applies to **entering only**. A trend already underway is not thrown out
because ADX dipped; gating the exit too would reintroduce the thrashing.

The chop went from **67% wrong-trend to 100% RANGE.**

### The fixture that lied

The first "sideways" fixture was Aug–Dec 2019. It fell **30%**. That is a downtrend, and
labelling it sideways to suit the test would have been inventing ground truth — the
exact mislabelled-fixture mistake the Pattern Engine's `RANGING` sine wave already
taught us. It was replaced with a period that genuinely went nowhere.

### Why the ground truth here is not an opinion

"There is no ground truth for a regime" is true **at the level of a given bar**. Nobody
can tell you what 14 March 2021 was.

But nobody sane disputes that a **+493% run is a bull market**, or that **−57% in ninety
days is a bear market**. At the level of a whole *period*, the label is not a judgement
call — and that is the only level at which the replay asserts anything.

Passing this benchmark is **not** calibration. Every classification is still stamped
`UNCALIBRATED`, including on data we know the answer to.

---

## 8. Caching

```
reg:BTC:1h:1752480000000
              └── the last CLOSED bar
```

The key **is** the invalidation. A cache that could serve a stale *regime* would be the
worst of the three engines: every strategy gates on it, so one stale entry would
silently mis-permission all of them at once.

---

## 9. No machine learning

A model could not tell a trader **why** the market is a bear market — only that it is.
The platform's entire promise is that a trader can see why. And it could not be tested
against the thing that matters, because there is nothing to test it against.

A weighted vote, with every ballot shown. Nothing cleverer.

---

## 10. Out of scope

Strategy evaluation · risk · confidence calibration · signals · notifications.

**This engine provides context. It never decides.**
