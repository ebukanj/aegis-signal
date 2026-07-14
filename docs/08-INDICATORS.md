# The Indicator Engine

> Indicators provide **evidence**. They never make decisions.

The mathematical core. It turns closed candles into numbers, and it knows nothing
about strategies, signals, risk or confidence. Everything downstream is built on
these numbers, and **none of it can detect an error in them** — a wrong ATR is a
wrong stop is a wrong position size is a real loss, and nothing between here and
the trader would flag it.

That is why this module is pure functions with an independent referee, rather than
something cleverer.

---

## 1. The rules

| Indicators **are** | Indicators **never** |
|---|---|
| Deterministic | Generate signals |
| Stateless, pure functions | Touch Redis or Postgres |
| Cached (above the calculator) | Call an exchange |
| Independently testable | Read configuration |
| Aligned one-value-per-candle | Read the clock |
| | Know a strategy exists |

`IIndicator.compute()` takes an array and returns an array. There is nowhere in
that signature to hide a side effect, and that is deliberate.

### The null is load-bearing

An EMA(200) has no value at bar 3. The honest answer is **`null`**, not `0`.

A `0` would be read by a strategy as *"price is above the 200 EMA"* — which on a
fresh listing is how a rule that believes it is being careful buys the top of a
pump. Every calculator returns `null` for undefined bars, and the
`OperatorEvaluator` treats a condition on a null as **false**, never true.

### No look-ahead. Ever.

- The validator **refuses** a series whose last candle has not closed.
- Ichimoku spans are computed **unshifted** — the classic +26 forward shift would
  mean the value at bar *i* was derived from candles at bar *i+26*, which do not
  exist yet.
- Divergence uses only **confirmed** pivots, so the most recent usable pivot is
  always `pivotStrength` bars in the past. That lag is the price of the pivot
  being real.

---

## 2. The vocabulary — 47 indicators

All 47 in `packages/contracts` are implemented. The registry **refuses to boot**
if the contract and the engine ever disagree, in either direction.

| Group | Indicators |
|---|---|
| **Price** | `open` `high` `low` `close` |
| **Volume** | `volume` `volume_sma` `obv` `cvd` `vwap` |
| **Moving averages** | `sma` `ema` |
| **Momentum** | `rsi` `macd_line` `macd_signal` `macd_histogram` `stoch_k` `stoch_d` `kdj_k` `kdj_d` `kdj_j` `cci` `williams_r` `roc` `mfi` |
| **Trend** | `adx` `plus_di` `minus_di` `supertrend` `psar` `ichimoku_tenkan` `ichimoku_kijun` `ichimoku_span_a` `ichimoku_span_b` |
| **Volatility** | `atr` `bb_upper` `bb_middle` `bb_lower` `bb_width` `keltner_upper` `keltner_lower` `donchian_upper` `donchian_lower` |
| **Structure** | `highest_high` `lowest_low` |
| **Statistics** | `zscore` |
| **Derivatives** | `funding_rate` `open_interest` `long_short_ratio` — **registered and unavailable** |

Per-indicator **formula, parameters, warmup, stability, complexity and edge
cases** are documented on each calculator in
[`apps/api/src/modules/indicators/application/calculators/`](../apps/api/src/modules/indicators/application/calculators/).
They live with the code because a formula in a separate document is a formula that
drifts from the code that implements it.

### The three that are declared unavailable

`funding_rate`, `open_interest` and `long_short_ratio` are **not derived from
candles** and never will be — they are separate exchange feeds the platform does
not yet collect. They are registered anyway and **throw `FeedUnavailableError`**.

That is deliberate over simply omitting them. An indicator *missing* from the
registry is a bug. An indicator that is *present and says "I have no feed"* is a
fact about the world, and a strategy depending on one stands down cleanly. Crowd
Squeeze already ships DISABLED for exactly this reason.

---

## 3. CVD — and why the Candle grew a column

**Cumulative Volume Delta cannot be computed from OHLCV.** It needs the *aggressor
side*: which volume was buyers crossing the spread. OHLCV counts both sides of
every trade, so a bar that fell 3% on huge volume and one that rose 3% on huge
volume are identical in it.

So `Candle` carries a nullable `takerBuyVolume`:

- **Binance** publishes it (REST kline column 9, WebSocket field `V`). The market
  module now calls Binance's raw kline endpoint rather than ccxt's `fetchOHLCV`,
  which drops it.
- **Bybit** does not. It is `null` there, so **CVD returns `null`** — the whole
  series, not a zero.

A zero delta would *claim* "buyers and sellers were exactly balanced this bar",
which is a statement about the market that a strategy would trade on. `null` says
"we cannot see it", and the strategy stands down.

**What it buys:** OBV *guesses* who was in control by where the bar closed. CVD
*measures* it. Two candle series identical in OHLCV — same open, close and volume
on every bar — are indistinguishable to OBV and are 90% buying versus 90% selling
to CVD. That is the difference between forced selling (a liquidation cascade
dumping into bids) and conviction selling (holders quietly leaving). Price falls
the same way in both. What happens next does not.

---

## 4. Correctness: an independent referee

Golden-master fixtures prove the code still does what it did the day it was
written — **bug faithfully included**. So the primary check is not a fixture.

Every core indicator is cross-checked against
[`technicalindicators`](https://www.npmjs.com/package/technicalindicators) — a
separate implementation, by other people, from the same published formulas —
across **trending, ranging and volatile** markets.

### Tolerances

| Kind | Tolerance | Why |
|---|---|---|
| Closed-form (SMA, Bollinger, Williams %R, CCI, MFI, Stochastic) | `1e-8` relative | Same arithmetic, different order. Only float64 noise may differ. |
| Recursive (EMA, ATR, ADX, MACD) | `1e-6` relative | Identical seeding, but recursion accumulates float64 noise over hundreds of bars. |
| RSI, MFI vs this reference | `0.005` **absolute** | The reference **hard-rounds to 2dp internally** (`parseFloat(x.toFixed(2))`) and cannot be told not to. We assert agreement within *its* quantization rather than rounding our own output to flatter the comparison. |

These are **float-noise thresholds, not "close enough" thresholds.** The bugs they
exist to catch move RSI by whole *points*:

- **Wilder's α = 1/n vs the EMA's 2/(n+1)** — nearly 2× different. This is the
  single most common way an RSI is quietly broken.
- **Population vs sample standard deviation** in Bollinger — widens every band,
  loosening every "outside the band" condition in the platform.
- **Mean absolute deviation vs standard deviation** in CCI — inflates it ~25% and
  pushes it across the ±100 lines it is read against.
- **Seeding an EMA with the first value** rather than an SMA.

Each produces a completely plausible curve. Each would miss these tolerances by a
factor of a thousand.

### Verified on live data

Against 499 real closed BTC 1h perpetual candles:

```
RSI(14)   ours    71.605547     reference      71.61   (2dp-rounded)
ATR(14)   ours   359.064024     reference 359.0640237876692
EMA(200)  ours 63057.569841     reference 63057.56984083786
CVD       ours    -14318.89     (impossible from OHLCV)
```

---

## 5. Rounding

> **Compute in full float64. Round once, at the boundary. Never in between.**

Rounding intermediates is how you get an RSI that disagrees with TradingView in
the third decimal for reasons nobody can reconstruct. Recursive indicators feed
each bar's output into the next bar's input, so a rounding error at bar 40 is not
a rounding error — it is a permanent bias in every bar after it.

Rounding happens once, in `normalizeSeries`, to **10 significant digits**:

- Well inside float64's ~15–17, so it discards only the noise that arithmetic
  order introduced.
- **Significant digits, not decimal places** — this platform prices BTC at 62,000
  and SHIB at 0.0000082 in the same array. 8 decimal places would round SHIB's
  entire range into a handful of values.

Why round at all? Because float64 addition is not associative, and **calibration
replays history** (ADR-024). A replay that does not reproduce is not a replay.

`normalizeSeries` is also the last line of defence against NaN and Infinity, both
of which become `null`. A NaN loose in a strategy is the worst failure this engine
can produce and it is completely silent: `NaN > 30` is false, and `NaN < 30` is
**also** false — so every condition reads as "not met", the strategy stops firing,
and nothing anywhere says why.

---

## 6. Multi-timeframe

A 15m strategy asks for `EMA(1h)` and `ATR(4h)` and never learns how they were
obtained.

**Fetch natively when the exchange supports the timeframe; aggregate only when it
does not.** Binance publishes all four of ours directly, so aggregating 240 × 15m
candles into a 1d bar would be 240× the network cost and would introduce
off-by-one bucketing bugs that fetching does not have.

When aggregation *is* needed, two rules:

1. **Buckets align to the epoch, not to the first candle we hold.** A 4h bar starts
   at 00:00, 04:00, 08:00 UTC — always. Bucketing from our first candle produces
   bars no exchange and no chart agrees with.
2. **A partial bucket is DROPPED.** If the last three 15m candles cover only ¾ of
   an hour, there is no 1h candle — there is a *forming* one, and emitting it is
   look-ahead bias.

Supported: `15m` `1h` `4h` `1d`. The resolver is timeframe-agnostic; adding `5m` or
`1w` is an enum change in the contract, not a refactor.

---

## 7. Caching — the key *is* the invalidation

```
ind:BTC:rsi:period=14:1h:1752480000000
                          └── the last CLOSED bar
```

There is **no invalidation logic**, and there must not be. When a new bar closes
the timestamp changes, so the key changes, and the old entry is simply never asked
for again.

The alternative — a key without the bar time plus a "delete on new candle" hook —
has a failure mode this design *cannot* have. If the hook ever misses (a dropped
event, a worker restart mid-close, a race between two closes), the platform serves
an indicator computed from **old candles** while believing it is current. Every
strategy reading it would be evaluating the previous bar's market. Nothing would
error. Nothing would look wrong.

**A cache that can serve stale market data is worse than no cache at all.**

Parameters are part of the key, because EMA(50) and EMA(200) are different
indicators and a key that omitted the period would serve one while the caller
believed it was reading the other.

Redis being down degrades the platform to *slower* — never to *wrong*, never to
*off*. A failed read counts as a miss and the value is computed.

---

## 8. Validation — refuse, never repair

The gate rejects, and does not fix:

| Refused | Because |
|---|---|
| Insufficient candles | An EMA(200) from 50 bars is an EMA(50) wearing a longer name. Most libraries return it anyway. |
| A **forming** last candle | Look-ahead bias. The one absolute rule. |
| Gaps | An SMA(20) over a series missing 5 bars averages 20 *present* candles spanning 25 bars of market. Wrong, and confident. |
| Out-of-order / duplicate timestamps | Every moving average becomes nonsense, undetectably by eye. |
| NaN / Infinity | Silently makes every strategy comparison false. |
| Negative volume | Not a market that exists. |
| MACD with `fast >= slow` | Arithmetically fine, meaningless as an indicator. |

Crypto trades 24/7, so unlike equities there are no legitimate weekend holes. A gap
is missing data.

---

## 9. Operators

16, and **one way to say each thing** — there is no `slope_positive` beside
`rising`, and no `inside_range` beside `between`. Synonyms look generous and are a
tax: two operators meaning the same thing are two code paths to keep in agreement,
and one day a bug in only one of them.

`gt` `gte` `lt` `lte` `eq` `neq` `crosses_above` `crosses_below` `between`
`outside_range` `above_average` `below_average` `rising` `falling`
`diverges_bullish` `diverges_bearish`

Three that carry a trap:

- **`crosses_above` is an EVENT, not a state.** It requires the *previous* bar to
  be on the other side. Treating it as a state turns "MACD crosses above signal"
  (fires once, at the turn) into "MACD is above signal" (fires on every bar of the
  trend that follows).
- **`eq` compares with a relative tolerance**, never `===`. An EMA is never exactly
  50, so `===` would mean the condition never fires and nothing would explain why.
- **`outside_range` is not `!between`.** An unknown value is outside nothing. Both
  are false on a null.

---

## 10. Divergence

Price makes a lower low; the oscillator makes a *higher* low. The move still
happened, but with less force behind it.

This is the easiest thing in the module to fake convincingly. "The RSI went up
while price went down" is true constantly, on noise, in every market — a detector
built on it fires several times a day and is worth nothing.

Real divergence is between **confirmed swing pivots**. A pivot low at bar *i* is
only a pivot once `pivotStrength` (default 5) bars *after* it have failed to go
lower. **The most recent usable pivot is therefore always 5 bars in the past.** An
implementation reporting a pivot at the current bar is reporting one it cannot yet
know exists — and it backtests brilliantly, because in a backtest the next five
bars are already there.

Returns `detected`, `strength`, `quality`, and **the two swings the finding rests
on** — never a claim without its evidence.

`strength` and `quality` are different questions and both are needed:

- **strength** — how big is the disagreement?
- **quality** — how much do I believe these are real pivots? Separation ×
  prominence × recency, **multiplied not averaged**, so a divergence that fails
  badly on any one factor is not "somewhat good", it is unusable.

*(A strong divergence between two rubbish pivots is a strong statement about
nothing.)*

---

## 11. Performance

O(n) wherever a naive implementation would be O(n·period):

- **SMA** — rolling sum with **Kahan compensation**. The naive `sum += next - oldest`
  accumulates a one-way error over thousands of bars that never washes out.
- **Rolling max/min** — monotonic deque.
- **Standard deviation** — **Welford**, not `√(E[x²] − E[x]²)`. The latter subtracts
  two large nearly-equal numbers and, on price series where the mean dwarfs the
  variance (BTC at 62,000 with a 40-point deviation), catastrophically cancels and
  can return a *negative* variance.

Genuinely O(n·period): CCI and MFI (both need the window's mean first) and the
rolling deviation. At period 20 over 1,000 bars that is 20,000 operations.

A full scanner pass — 19 symbols × 4 timeframes × 12 indicators ≈ **900 series** —
completes in well under a second. The benchmark asserts a 50ms ceiling per
indicator as a **tripwire, not a target**: it catches the day someone replaces a
rolling window with a nested loop, which fails no correctness test and quietly makes
the scanner miss its bar weeks later.

---

## 12. The benchmark datasets

Every indicator runs against all five. Deterministic and seeded — a test that
generates fresh random data fails once a fortnight for reasons nobody can
reproduce, and is then deleted.

| Dataset | What it catches |
|---|---|
| `TRENDING_UP` / `TRENDING_DOWN` | Recursive drift; stops being dragged |
| `RANGING` | Oscillator whipsaw; **ADX must stay low** |
| `VOLATILE` | True Range dominated by **gaps**, not bar bodies — where a naive `high − low` under-reports risk |
| `ILLIQUID` | **Every divide-by-zero in the module.** Flat bars, zero volume, identical highs and lows. Finds more bugs than the other four combined, and never appears in a tutorial. |

### `RANGING` was a lie, and it taught us something

It began as `150 + sin(i/8)·6 + noise`. That *looks* sideways and is nothing of the
sort: each half-cycle is a smooth, persistent, 25-bar directional move — a clean
little trend. ADX(14) read **42** on it, and **ADX was right**. The fixture was
lying.

We only knew where to look because the cross-check against `technicalindicators`
agreed with us to 1e-6 *on that very data*. It is now a mean-reverting
Ornstein-Uhlenbeck walk with no persistence.

**A mislabelled fixture does not fail. It misleads.** Every future test written
against `RANGING` would have been quietly asserting things about a trending market.

---

## 13. Out of scope

Pattern detection · market regime · strategy evaluation · risk · confidence ·
signals · notifications.

Indicators provide evidence. **They never make decisions.**
