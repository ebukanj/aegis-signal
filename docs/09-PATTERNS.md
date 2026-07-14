# The Pattern Engine

> Indicators answer *"what is happening mathematically?"* — RSI is 28.3.
> Patterns answer *"what structure is the market forming?"* — price swept the lows and reclaimed.
>
> **Patterns provide structural evidence. They never make decisions.**

The second question cannot be expressed as an indicator comparison, and that is the
whole reason this module exists. No arrangement of moving averages tells you that
price took out the stops under an obvious double bottom and snapped back.

---

## 1. What it refuses to detect — and why that is the feature

**Head & shoulders. Inverse head & shoulders. Cup & handle. Rounded tops. Rounded
bottoms. Broadening wedges. Elliott waves.**

Milestone 05's brief asked for all of them. [ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)
rejected them, and ADR-024 wins:

> *"Ten traders draw them ten different ways. A deterministic detector for them would
> be **inventing certainty**, and inventing certainty is the thing this platform
> exists not to do."*

A "deterministic" H&S detector would not be detecting anything. It would pick one
arbitrary reading of a neckline, stamp a quality score on it, and present the result
as a measurement.

The contract refuses these names, and **`pattern-result.test.ts` now enforces it.**
That file's comment had always claimed *"there is a test asserting this"* — and
there wasn't one. The guarantee was documentation describing a safety net nobody had
built. It exists now.

A broadening wedge is the wedge family's version of the same problem: its trendlines
*diverge*, so almost any choppy stretch of chart can be fitted to one.

**If a future milestone asks for these again, that is a request to overturn ADR-024
and it needs an ADR — not a quiet addition to an enum.**

---

## 2. The vocabulary — 24 patterns

Every name in the contract resolves to a detector, or **the application does not
boot.** A strategy referencing a pattern that silently does not exist would fail on
a live market, on a signal that should have fired, with an error nobody is watching.

| Group | Patterns |
|---|---|
| **Structure** (objective) | `HIGHER_HIGH_HIGHER_LOW` `LOWER_HIGH_LOWER_LOW` `BREAK_OF_STRUCTURE` `CHANGE_OF_CHARACTER` `RANGE` |
| **Liquidity** | `LIQUIDITY_SWEEP` `EQUAL_HIGHS` `EQUAL_LOWS` `ORDER_BLOCK` `FAIR_VALUE_GAP` |
| **Reversal** | `DOUBLE_TOP` `DOUBLE_BOTTOM` `TRIPLE_TOP` `TRIPLE_BOTTOM` |
| **Geometry** (fitted, always scored) | `BULL_FLAG` `BEAR_FLAG` `PENNANT` `FALLING_WEDGE` `RISING_WEDGE` `ASCENDING_TRIANGLE` `DESCENDING_TRIANGLE` `SYMMETRICAL_TRIANGLE` `ASCENDING_CHANNEL` `DESCENDING_CHANNEL` |

Several patterns in the brief are **already here under their real names**, and were
not duplicated: Rectangle *is* `RANGE`; Stop Hunt / False Breakout / Liquidity Grab /
Reclaim are all one event, `LIQUIDITY_SWEEP`; Imbalance *is* `FAIR_VALUE_GAP`;
Supply/Demand zones *are* `ORDER_BLOCK`. Minting synonyms would mean several
detectors firing on the same bar and the Confluence layer counting one piece of
evidence four times.

### Objective vs geometric

An **objective** pattern scores `quality: 1`, and the schema refuses anything less. A
break of structure is not "0.8 of a break" — price took out the swing high or it did
not. Inventing doubt to look rigorous is the mirror image of inventing certainty.

A **geometric** pattern is fitted, and therefore always a matter of degree.

---

## 3. Everything rests on swings

Market structure, break of structure, every wedge, every flag, every double top —
all of them are statements about swings. **A swing engine that is subtly wrong does
not produce subtly wrong patterns. It produces confident, well-formed, completely
fictional ones.**

- **One pivot algorithm**, in `indicators/math/pivots.ts`, shared with the Divergence
  Engine. It used to have its own copy. Two implementations of "where is the swing?"
  do not stay in agreement — one gets a fix the other doesn't, and then the platform
  reports an intact uptrend while the divergence detector compares swings the
  structure engine has never heard of. Both answers look reasonable in isolation.

- **Swings are computed ONCE** per timeframe and shared with every detector. Partly
  for speed; mostly because two detectors that computed their own could disagree, and
  then *"bull flag confirmed by intact structure"* would be confirming itself against
  a market it had drawn differently.

- **Confirmation costs lag, and the lag is the price of the swing being real.** A
  pivot low is only a pivot once `strength` (default 5) bars *after* it have failed to
  go lower. The most recent confirmable swing is therefore always 5 bars in the past.
  A detector reporting a swing at the current bar is reporting one it cannot know
  exists — and it will backtest beautifully, because in a backtest those bars are
  already there.

- **Prominence** — how far a swing stands out from its neighbours, as a *fraction* of
  price — is what separates a swing from a wiggle, and it is what stops every detector
  in this module from finding textbook geometry in a flat market.

---

## 4. Market structure — the highest-value output

An EMA lags, and it lags hardest at exactly the moment a trend breaks. A strategy
checking *"price above the 200 EMA"* is checking whether the trend **was** intact —
and will happily buy the first leg down.

Higher highs and higher lows is not a *proxy* for an uptrend. It **is** one.

**UPTREND requires both.** Higher highs with *lower* lows is not an uptrend — it is
an expanding range, one of the most dangerous things to trade with a trend rule,
because volatility is widening in both directions and a stop sized for yesterday is
about to be noise. When highs and lows disagree, the answer is **RANGING**.

| Event | Meaning |
|---|---|
| **Break of Structure** | Price closed beyond a swing **with** the trend. Confirmation — and late. |
| **Change of Character** | Price closed beyond a swing **against** the trend, for the first time. The earliest structural evidence a trend is ending, long before any moving average turns. |

Conflating them is expensive in both directions: treat a CHoCH as a BOS and you buy a
breakdown; ignore it and you hold through one.

### A break is a CLOSE, never a wick

This single decision separates a structure engine that works from one that fires on
every stop hunt. A wick through a swing low is exactly what a liquidity sweep looks
like — price dips, takes the stops, snaps back. If a wick counted as a break, the
engine would report a change of character on the very bar the market was *defending*
the level, inverting the meaning entirely.

The Structure Engine and the LiquiditySweep detector are **exact complements**:
exactly one of them is right about any given bar.

---

## 5. Zones — standing structure, not events

A pattern *happens*. A zone *is*.

**A zone is a BAND, never a line.** "Resistance at 62,400" is a fiction that feels
precise. Price rejected from 62,380 once and 62,450 another time, and real orders sit
across that whole band. A single line produces a stop placed one tick beyond a level
that was never that precise — and it gets taken out by noise the real zone would have
absorbed. *The width is the measurement, not sloppiness to be tidied away.*

`SUPPORT` · `RESISTANCE` · `DEMAND_BLOCK` · `SUPPLY_BLOCK` · `LIQUIDITY_POOL`

Three things most implementations get backwards:

1. **More retests does NOT mean stronger.** A level tested twice and holding is
   strong. A level tested seven times is being *worn down* — each test consumes the
   resting orders that made it a level. The strength curve peaks around three touches
   and **decays** after. A naive `strength = retests / 10` ranks the level most likely
   to break as the strongest on the chart.

2. **A broken zone is re-labelled, not deleted.** Broken resistance routinely becomes
   support. An engine that forgets the level cannot see the retest.

3. **A liquidity pool is a magnet, not a wall.** Under equal lows sits a pile of stop
   orders. The level *looks* like support and is in fact a **target** — those stops
   are the liquidity a large order needs in order to fill. This is the most expensive
   misreading in retail trading: placing a stop just under an obvious double bottom,
   precisely where the market is most likely to reach before reversing.

---

## 6. Quality — every detector must argue against itself

Never `BULL_FLAG = true`. Every detection carries:

```
quality · strength · confirmed · breakoutPending · volumeConfirmed
evidence[] · weaknesses[] · the swings it used
```

**`weaknesses` is required.** A pattern that reports only its strengths is marketing.
`quality: 0.87` is unfalsifiable — a trader can only accept it. *"The pole ran 6.2% in
4 bars, the pullback retraced 38% on falling volume, trendlines fit at R²=0.91 —
however, the breakout came on below-average volume"* is a claim a human can push back
on. The platform's whole promise is that a trader can see **why**.

**quality ≠ strength.** Quality asks *"is this really a flag?"*; strength asks *"is
this flag worth anything?"* A textbook flag on a dead 15m chart is high quality and
low strength.

### Factors multiply — they do not average

The most important decision in the quality engine. A bull flag with a textbook pole,
textbook trendlines, and swings so shallow they are indistinguishable from noise is
not a "mostly good" flag. **It is not a flag.** Averaging scores it 0.7 and ships it;
the geometric mean scores it near zero, which is the truth.

Averaging lets two strong factors carry a fatal one — and in a system whose output is
a trade, that is the difference between a pattern and a Rorschach test.

*(The geometric mean, not a plain product: five factors of 0.8 score 0.8, not 0.33.
One zero factor still kills it.)*

---

## 7. The trap: any two points define a line

A pattern detector is trivially easy to write **wrong**, and the wrong version does
not crash. It finds patterns everywhere — beautifully formed and completely
imaginary. Every wedge it reports really *is* two lines through two sets of points.
The geometry is flawless. The pattern is not there.

Four defences:

1. **Three touches minimum.** With two points, R² is 1.0 by construction.
2. **R² must be high.** Do the swings *lie* on the line, or were they merely connected
   by it?
3. **Price must RESPECT the line.** Three swing highs on a line is a coincidence if
   price closed above that line four times in between. *This is the check naive
   detectors leave out, and it kills the most false positives.*
4. **Swings must be PROMINENT.** Geometry built on pivots 0.05% above their
   neighbours is geometry built on rounding errors.

Below `MINIMUM_REPORTABLE_QUALITY` (0.5), a geometric pattern is **not reported at
all**. A wedge at quality 0.3 is not a low-quality wedge — it is two lines drawn
through noise, and shipping it "for the strategy to filter" floods Confluence with
junk. *"Several low-quality patterns agree"* is exactly the false confidence this
platform exists to refuse.

---

## 8. The false-positive suite — and the two bugs it found

**The most important tests in the module.** Feed the engine pure random walks — which
have no structure by construction, so every pattern found is by definition a false
positive — and it must find almost nothing.

The first aggregate run failed at 16.6% against a 15% bar. Raising the bar would have
hidden two real bugs and one conceptual error.

### Bug 1 — Order Block was detecting random walks walking

It required a 3-bar move of **2×** the average bar range. But a random walk's expected
3-bar displacement is already **√3 ≈ 1.73×**. The threshold was barely above chance.

Fired in **70%** of noise → now **3%**. The threshold is now expressed *as a multiple
of √n*, so it stays honest if the bar count is ever changed.

### Bug 2 — Liquidity Sweep had the wrong definition

It swept *any* prior swing. But **"liquidity" means clustered stops**, and stops do
not rest under every squiggle — they pile up under levels people can see and have
already traded off. A level visited once has no pool beneath it.

Requiring the swept level to have been tested at least twice: **83% → 45%**, and to
**zero** once quality is accounted for. *That was a fix to the definition, not to a
threshold, and no amount of tuning would have found it.*

*(It also surfaced a third thing: `MINIMUM_PROMINENCE` was declared in the swing
engine and enforced **nowhere** — dead code that read like a safety net.)*

### The conceptual error — facts vs claims

A random walk really *does* print higher highs and higher lows ~38% of the time. A
1%-volatility series really *does* contain three-bar imbalances. Reporting those is
not hallucinating — it is **describing the data**, and the contract already pins those
patterns at `quality: 1` because they are not matters of degree.

So the aggregate is measured over the **interpretive** detectors (the ones that fit a
shape and therefore *can* be wrong), at a realistic strategy gate:

> **Fewer than 6% of interpretive scans over pure noise produce an actionable pattern
> (quality ≥ 0.7 and strength ≥ 0.3).** In practice: ~2%. Liquidity Sweep and Order
> Block drop to **zero**.

### ⚠️ A warning for M06 (Confluence)

`FAIR_VALUE_GAP` fires on ~95% of random walks. `HIGHER_HIGH_HIGHER_LOW` on ~38%. Both
are *true*. But:

> **Confluence must weight by quality × strength, NEVER by count.**

Three objective patterns "agreeing" is not three pieces of evidence — it is three
descriptions of the same unremarkable chart. A confluence engine that counts them will
manufacture high confidence out of a random walk. There is a test making this
frequency visible so it cannot be a surprise.

---

## 9. Caching — the key IS the invalidation

```
pat:BTC:1h:s5:1752480000000
                └── the last CLOSED bar
```

The brief asks the cache to *"automatically invalidate after new confirmed swings"*. A
hook that deletes entries when swings change has a failure mode this design **cannot
have**: if the hook ever misses — a dropped event, a worker restart mid-close — the
platform serves market structure computed from **old candles** while believing it is
current. Nothing would error.

A new confirmed swing can only appear when a new bar closes, and a new bar changes the
key. The requirement is satisfied *structurally* rather than by a hook someone can
forget to call.

Swing **strength** is in the key too: patterns detected at strength 3 and 5 are
different patterns.

---

## 10. Verified on live data

Against 299 closed BTC 4h, BTC 1h and ETH 1h perpetual candles:

- Real market structure (RANGING on all three — BTC was chopping), 17–20 swings each.
- 20–31 real zones per symbol across all five kinds.
- Real fair value gaps with correct **fill status** (`UNFILLED — the orders that never
  got filled are still there`).
- Equal highs at a genuine 0.133% apart.
- **Zero geometric patterns.** There were no clean flags or wedges on a ranging BTC
  chart, and the engine said nothing rather than inventing one.

That last line is the whole engine in one sentence.

---

## 11. Out of scope

Strategy evaluation · risk · confidence · signals · notifications.

**Patterns provide structural evidence. They never make decisions.**
