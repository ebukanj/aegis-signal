# The Confidence & Calibration Engine — Earned Trust

> The Strategy Evaluator asks: *"Does the setup exist?"*
> The Risk Engine asks: *"Is the setup acceptable?"*
> The Confidence Engine asks: **"Based on everything we have learned from the past,
> how much trust has this exact setup earned?"**

And it is the only one of the three whose honest answer, today, is often **"none
yet."** That answer is a feature, not a gap.

---

## 1. The lie this engine was built to end

The code this platform replaced computed confidence like this:

```ts
confidence = randInt(52, 92) + (strategies.length - 1) * 4;
```

A random number, plus four points for every strategy that agreed. When the UI
rendered **"91%"**, it meant nothing at all. The owner's instruction was exact:
*"if you say ninety-one, I want you to watch that ninety-one."*

[ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md) is the whole
philosophy, and it rests on one distinction that everything below serves:

> **The evidence is real from day one. Only the leap from score → probability
> needs history.**
>
> *"volume 2.3× its 20-bar average", "RSI 68", "a bull flag at quality 0.81"* —
> arithmetic on candles, true on the first bar the platform ever sees. But *"91
> means you win 91% of the time"* is a claim about **outcomes**, and no amount of
> live market data proves it. It has to be earned from outcomes, or not made.

So the platform separates two things every other trading product merges:

- **The SCORE** — how much evidence supports this setup. Real, day one.
- **The PROBABILITY** — what a score like this has historically been *worth*.
  Earned, or absent.

A signal is never *"92% likely to win."* It is *"score 92 — and setups scoring in
this band went on to hit their first target 61% of the time across 1,284 replayed
instances, which is a fact about a backtest and not a promise about your money."*

---

## 2. The score — named contributors, stated weights, no black box

Every score is a sum a human can check (Founding Principle 3 — *every signal must
be explainable*):

```
Base                                              50
+ Market regime — TRENDING_BULL, a market Breakout wants   +9
+ Trend alignment — 100% of timeframes aligned             +6
+ Momentum — RSI 63, MACD histogram positive               +5
+ Volume confirmation — 2.1× its 100-bar median            +6
+ Pattern quality — bull flag, quality 0.78                +8
− Structure — resistance 40% of the way to target          −3
──────────────────────────────────────────────────────────────
Score                                                      81
```

Every contributor states its **source** (`MEASURED` / `RULE` / `HISTORICAL`) and
the value it was derived from. There is nowhere to hide a number that came from
nowhere.

### The base is a constant — a deliberate departure from ADR-024's sketch

ADR-024 illustrates the score starting from the strategy's historical win rate
(*"Base — Breakout's win rate in an uptrend  52"*). Building it revealed that this
cannot work, for two reasons that only appear once you try:

1. **It is circular.** Calibration maps score → win rate. If the score already
   *contains* a win rate, every refit changes the scores the next refit is fitted
   on, and a replayed setup's score depends on which model was live when it ran —
   which destroys *Deterministic Replay*, an acceptance criterion of this
   milestone.
2. **It cannot exist in the corpus.** The base *is* the win rate the replay is
   computing; during the replay there is no such number to add. Live scores would
   carry a base and corpus scores would not, shifting the two distributions apart
   by tens of points — and the calibration would become a lookup table built for
   one quantity and applied to another.

So the base is a constant (50), history enters through *calibration* and the
strategy's separately-reported record, and the strategy's record is shown at
**weight zero** — informing, never pricing. 50 is not a claim the trade is a coin
flip. **The score is not a probability.**

### Confluence is worth zero, on purpose

The old `+4 per agreeing strategy` was invented. ADR-024 §6 is explicit: the
uplift is *derived from the ledger*, and *until there is data, the uplift is zero*.
So the confluence contributor reports the fact (*"3 strategies agree"*) and charges
nothing for it. The policy **refuses to boot** if the confluence weight is ever set
above zero without the measurement behind it.

---

## 3. Where the probability comes from: the replay

There is no live ledger — no signal has ever been published. So the only honest
source of a probability on day one is the one ADR-024 mandates: **replay the
strategy documents over real exchange history, and see what actually happened.**

The replay walks two years of candles one bar at a time and, at every bar, asks the
*exact* question the live platform asks — using the **same** engines:

> Does a strategy fire here? Does the Risk Engine allow it? What score does the
> evidence deserve? Then walk forward and find out what happened.

### It runs the real engines, not a reimplementation

The replay constructs **no logic of its own**. It calls the same
`StrategyEvaluator`, `RiskPipeline`, `RegimeClassifier`, `AlignmentService` and —
critically — the same `ScoreBuilder` that production calls. A backtest that
reimplements the strategy logic measures a system nobody trades; its win rate is a
fact about the backtest. This one is wrong only in the exact ways the live platform
is wrong, which is the only consistency worth anything.

### The three ways a backtest lies, and the guard against each

| Lie | Guard |
|---|---|
| **Look-ahead** | Every bar sees a window ending at `T`; outcomes are labelled from candles strictly after `T`. A higher-timeframe bar is visible only once *it too* has closed by `T` — the 4h candle still forming around `T` is invisible, which is the subtlest look-ahead bug in a multi-timeframe backtest and the one that makes a strategy look prescient. |
| **A different engine** | The same engines. See above. |
| **In-sample optimism** | ADR-024 names this an accepted risk: these rules were written by people who had already seen this history. Guard: **walk-forward** (fit on the older 70%, grade on the newer 30%), and the result is labelled `HISTORICAL` forever — never `LIVE`, never merged into a live track record. It is a prior, announced as one. |

### It cannot run the microstructure gates, and says so

**Binance does not sell you the order book of March 2024.** Spread, depth,
exchange latency and funding are not recoverable from candles. So the replay runs
only the candle-computable risk gates (`HISTORICALLY_REPLAYABLE`) and refuses to
synthesise the rest — a fabricated spread in the corpus would be a fabrication
every downstream statistic then treats as a measurement. Live signals are gated
*more* strictly than the corpus was, which biases the corpus toward *including*
marginal setups live trading would refuse — the safe direction. A test asserts
every risk gate is classified replayable-or-live, so a new gate cannot be silently
skipped.

---

## 4. What "won" means — the labeller, where a backtest lies most

Every number the platform prints about its own reliability descends from one
function: the outcome labeller. It is pessimistic by construction, in the three
places where it is possible to be either.

- **Target before stop = WIN.** Walk future candles; the first target hit before
  the stop is a win, in whatever R the trade offered.
- **A bar that touched BOTH = LOSS.** An hourly candle whose high cleared the
  target *and* whose low broke the stop tells us both prices traded — not in which
  order, and OHLC discards the path. Calling it a win inflates every number, and
  inflates them *worst* for the tight-stop, near-target setups an optimiser would
  then select for. **We take the loss**, because we cannot know, and a platform
  whose premise is "measured, never asserted" does not get to resolve its own
  ambiguities in its own favour. (The honest fix — walking a finer timeframe — is
  future work.)
- **Neither within the horizon = EXPIRED, and EXPIRED is a NON-WIN.** Dropping the
  setups that went nowhere — keeping every trade that worked — is the oldest way in
  the world to manufacture a win rate. Expired setups stay in the denominator.

---

## 5. The arithmetic that stops a lucky streak becoming a claim

A new strategy fires three times and wins all three. Naive win rate: **100%**.

That is a lie of the most seductive kind — it is *arithmetically correct*. Three
divided by three really is one. Three coin flips landing heads happens one time in
eight with a fair coin.

The fix is **Beta-Binomial shrinkage** — start from what we already believe (the
global base rate) and move off it in proportion to how much evidence there actually
is:

```
              wins + k·prior
   posterior = ──────────────         (k = 20 pseudo-observations)
              samples + k
```

```
   3 wins from 3      → 48%    ← not 100%
   30 wins from 50    → 54%
   300 wins from 500  → 59%    ← converging on the truth
```

No machine learning. Two additions and a division, checkable on an envelope. The
policy **refuses to boot** with a prior of zero, because a zero prior is exactly
how three lucky setups become a 100% win rate.

### The blend: history is the prior, live is the evidence

When our own settled signals begin to arrive (M10+), they enter as *evidence* over
the historical *prior*. Each live outcome pulls the number toward reality; after
~30 live signals in a score bucket, **history is dropped entirely** — because a
backtest can be re-run until it flatters and a live result cannot. History and live
are **never silently merged behind one number**: the `basis`
(`UNCALIBRATED`/`HISTORICAL`/`BLENDED`/`LIVE`) always says which is speaking, and
the contract refuses to carry a live win rate with no live samples behind it.

---

## 6. Three calibrators, and the one caught lying

A score becomes a probability through one of three fitted models, and **the one
that ships is the one with the best OUT-OF-SAMPLE calibration error** — not the one
anyone preferred.

- **Shrinkage** (default) — the only one that degrades gracefully; a bucket of two
  returns nearly the base rate and a wide interval, which is the correct amount of
  belief to place in two observations.
- **Platt** (logistic, IRLS with ridge) — borrows strength across buckets, survives
  sparsity, and (thanks to the ridge term) *never emits 0 or 1* even on perfectly
  separable data. A model that says "certain" has stopped being a probability.
- **Isotonic** (pool-adjacent-violators) — the most flexible, and expected to
  **lose** on a small corpus because fitting the noise exactly is what it does.
  **There is a test that proves it overfits** — asserting that it reports 100% from
  two coin flips — so that if someone later switches the default to isotonic
  because it scored beautifully in-sample, the test says why that was a mistake.

### Graded four ways, out of sample

- **Brier** — mean squared error; the headline. Above 0.25 is worse than a shrug.
- **Log loss** — punishes *confident* wrongness savagely (an assured 99% that loses
  costs 4.6 nats). It catches the exact failure this platform exists to avoid: not
  being wrong, but being *sure* and wrong.
- **ECE** — the average gap between what we said and what happened; the number a
  trader feels.
- **MCE** — the *worst* bucket. A model can have a beautiful ECE and be catastrophic
  in the one rare, confident bucket people bet the most money on.

All reported on the **validation half** — the data the model never saw. Reporting
them in-sample would be marking your own homework.

---

## 7. Versioned, never overwritten

A signal published on Tuesday claimed a number produced by Tuesday's model. If
Wednesday's refit replaced it in place, Tuesday's signal would be judged against a
model that did not exist when it spoke — and the platform's track record would
become unfalsifiable, a politer word for fictional. So every model is versioned,
every version stays on disk forever, and every signal stores which one spoke. The
reliability curve is then a real experiment: a prediction made in advance, graded
afterwards, by a model that cannot change its mind.

---

## 8. The thresholds gate on the SCORE, and Prime stays barred

Publication (85) and Prime (92) gate on the **score** — real evidence from day one
— while the calibrated win rate rides alongside as the honest statement of what
that score has been worth (and may be null). Gating on the win rate would mean the
platform emits *nothing* until a replay exists, and then gates on an optimistic
in-sample number.

And **Prime stays barred for every strategy**, because ADR-023 §4 forbids Prime to
UNPROVEN strategies, a backtest does not prove a strategy, and no strategy yet has a
settled *live* record. A replay does not earn a strategy the platform's most
prominent slot. If it did, the slot would mean nothing.

---

## 9. What the replay found

Two years of real Binance history, ten pairs, four timeframes:

```
THE CORPUS   96 labelled setups · 10 pairs · 2024-09-14 → 2026-07-04
             39W / 57L / 0X   base rate 40.6%
             fit on 80 · GRADED on 16 it never saw

THE MODEL    v1 · SHRINKAGE — chosen on out-of-sample error
             in-sample     ECE 0.032   (flattering — it fitted this)
             OUT-OF-SAMPLE ECE 0.088   ← the number that counts
                           Brier 0.228 · log loss 0.649

THE CURVE (out of sample)
             80–84  said 47.7% → was 100.0%  (n=1)
             85–89  said 40.1% → was  40.0%  (n=5)
             90–94  said 38.8% → was  30.0%  (n=10)
```

That curve is thin and it is honest, and the thinness is itself informative: the
`n=1` bucket saying "47.7% → 100%" is a single setup that happened to win, and the
MCE of 0.52 refuses to let that lucky bucket hide behind the well-behaved ones.
This is the machinery working exactly as designed — reporting how little it knows
as loudly as what it knows.

### The findings the replay surfaced — three of them, and none worked around

**1 · Breakout barely breaks even.** 93 setups, a 39.8% win rate, expectancy
**−0.01R**, profit factor **0.99**. Over two years across ten major pairs,
Breakout as written does not make money. That is not a defect in the confidence
engine — it is the confidence engine doing its one job: telling the truth about a
strategy the platform would otherwise have shipped a confident number for. Under
ADR-024's auto-disable logic, a strategy with negative expectancy is eventually
switched off; the machinery to notice now exists.

**2 · The R:R floor made two strategies unpublishable — FIXED.** Level Bounce
(1.0R first target) and Reversal (1.2R) sat below the Risk Engine's 1.5R floor, so
every candidate they produced was vetoed on `RISK_REWARD` by construction. With
the owner's approval, both first targets were raised to 1.5R (and the editing
correctly wiped their prior records per ADR-024). Reversal now contributes setups;
it produced too few (3) for a believable rate, and the engine shrinks its raw
66.7% to 44% and says so.

**3 · Level Bounce is still blocked — by a DIFFERENT floor.** Raising its target
cleared the R:R veto, but exposed a second, independent conflict: Level Bounce
places a **0.5-ATR stop**, and the Risk Engine refuses any stop tighter than
**0.8 ATR** (a stop inside the noise is a donation, M08). So every Level Bounce
candidate now dies on `STOP_QUALITY` instead. This was **not** worked around — it
is a genuine product decision (is a tight-stop mean-reversion scalp compatible
with the veto's stop-quality floor?) and it is left for the owner, exactly as the
replay's own logs insist: a zero is not a threshold to be loosened away.

---

## 10. What the platform now knows about itself

The confidence metrics endpoint exposes the number an operator must watch: the
**out-of-sample calibration error**. If it drifts upward, the scorer is
overconfident — talking traders into trades with a number it has not earned — and
the contributor weights in `confidence.policy.ts` are the thing to retune. The
reliability curve makes any such lie visible, and ADR-024 puts it on the Track
Record page for exactly that reason.

And the single most important fact the metrics report, plainly, every time:

> **No signal has ever been published and settled.** Every win rate this platform
> reports comes from replayed history, which is optimistic by construction. The one
> thing that truly earns trust — our own live track record — is the one thing that
> does not exist yet.

---

## 11. Out of scope

Signal publication · Prime budget · notification delivery · AI commentary ·
portfolio analytics. This engine determines *how much trust an approved opportunity
has earned*, and stops there.
