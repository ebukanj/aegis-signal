import type { Candle } from "@aegis/contracts";
import type { IIndicator } from "../../domain/indicator.interface";
import { trueRange } from "../math/source";
import { highest, lowest, wilder, type Maybe } from "../math/rolling";

/**
 * Trend — is there one, which way, and where does it stop being true?
 */

/* ── ADX / DI ──────────────────────────────────────────────────────── */

/**
 * Directional movement: +DM, −DM, and the ADX built on them.
 *
 * ── The rule everyone gets wrong ──
 *
 * On any given bar, **at most one of +DM and −DM can be non-zero.** An outside
 * bar — one that makes both a higher high and a lower low — has NOT moved
 * directionally in both directions at once. Whichever move was larger wins, and
 * the other is set to zero. Implementations that record both produce a +DI and a
 * −DI that are simultaneously elevated, an ADX that never falls, and a trend
 * filter that says "strong trend" in a market going nowhere.
 */
function directional(
  candles: readonly Candle[],
  period: number,
): { adx: Maybe[]; plusDi: Maybe[]; minusDi: Maybe[] } {
  const n = candles.length;

  const plusDm: Maybe[] = new Array(n).fill(null);
  const minusDm: Maybe[] = new Array(n).fill(null);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    // Exclusive by construction. Both can be zero (an inside bar moved neither
    // way); they can never both be positive.
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  const tr = trueRange(candles);

  // Wilder throughout — he invented this one too, and an EMA here produces an ADX
  // that agrees with nothing.
  const smoothedTr = wilder(tr, period);
  const smoothedPlus = wilder(plusDm, period);
  const smoothedMinus = wilder(minusDm, period);

  const plusDi: Maybe[] = new Array(n).fill(null);
  const minusDi: Maybe[] = new Array(n).fill(null);
  const dx: Maybe[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const atr = smoothedTr[i];
    const plus = smoothedPlus[i];
    const minus = smoothedMinus[i];

    if (atr === null || plus === null || minus === null) continue;

    // A zero true range over the whole window means price did not move at all.
    // There is no direction to report — not a direction of zero.
    if (atr === 0) continue;

    const p = (plus / atr) * 100;
    const m = (minus / atr) * 100;

    plusDi[i] = p;
    minusDi[i] = m;

    const sum = p + m;
    dx[i] = sum === 0 ? 0 : (Math.abs(p - m) / sum) * 100;
  }

  /*
   * ADX is Wilder's smoothing of DX — a smoothing OF a smoothing, which is why it
   * lags so badly and why its warmup is roughly 2·period rather than period.
   * That lag is not a flaw to be tuned out: ADX is a *confirmation* that a trend
   * exists, and a fast confirmation would confirm noise.
   */
  const adx = wilder(dx, period);

  return { adx, plusDi, minusDi };
}

/**
 * ADX — trend STRENGTH, and deliberately not trend direction.
 *
 * Formula:     Wilder(DX, period), where DX = 100·|+DI − −DI| / (+DI + −DI)
 * Defaults:    period 14
 * Warmup:      2·period bars (a smoothing of a smoothing)
 * Stability:   ~5·period — doubly recursive, so doubly slow to forget its seed
 * Complexity:  O(n)
 *
 * Reads 0–100. Below ~20 there is no trend and every trend-following rule on the
 * chart is going to lose money in chop; above ~25 there is one. It says NOTHING
 * about which way — a violent downtrend and a violent uptrend both print a high
 * ADX. That is what +DI and −DI are for, and conflating them is how a strategy
 * ends up buying strength in a collapse.
 */
export const adxCalculator: IIndicator = {
  name: "adx",
  label: "ADX",
  defaults: { period: 14 },
  warmup: (p) => (p.period ?? 14) * 2,
  stability: (p) => (p.period ?? 14) * 5,
  compute: ({ candles, params }) => directional(candles, params.period ?? 14).adx,
};

/**
 * +DI — the share of movement that was upward.
 *
 * Warmup:      period + 1 bars
 * Complexity:  O(n)
 */
export const plusDiCalculator: IIndicator = {
  name: "plus_di",
  label: "+DI",
  defaults: { period: 14 },
  warmup: (p) => (p.period ?? 14) + 1,
  stability: (p) => (p.period ?? 14) * 4,
  compute: ({ candles, params }) =>
    directional(candles, params.period ?? 14).plusDi,
};

/** −DI — the share of movement that was downward. */
export const minusDiCalculator: IIndicator = {
  name: "minus_di",
  label: "−DI",
  defaults: { period: 14 },
  warmup: (p) => (p.period ?? 14) + 1,
  stability: (p) => (p.period ?? 14) * 4,
  compute: ({ candles, params }) =>
    directional(candles, params.period ?? 14).minusDi,
};

/* ── Supertrend ────────────────────────────────────────────────────── */

/**
 * Supertrend — an ATR band that flips sides, and only ever ratchets toward price.
 *
 * Formula:     basic upper = hl2 + multiplier·ATR
 *              basic lower = hl2 − multiplier·ATR
 *              then each band is made MONOTONIC while the trend holds, and the
 *              line is whichever band the trend is currently on.
 * Defaults:    period 10, multiplier 3
 * Warmup:      period + 1 bars
 * Complexity:  O(n)
 *
 * ── The ratchet is the entire indicator ──
 *
 * The naive version plots `hl2 ± k·ATR` and flips when price crosses it. That
 * produces a line that moves DOWN in an uptrend whenever volatility expands —
 * which means the stop it implies gets looser the more dangerous the market
 * becomes. Backwards.
 *
 * The real rule: while the trend is up, the lower band may only ever RISE. It
 * ratchets. It never gives ground. When price finally closes below it, the trend
 * flips and the upper band takes over, ratcheting downward. That one-way movement
 * is why Supertrend works as a trailing stop and why a naive implementation of it
 * does not.
 *
 * ── Direction, not just level ──
 *
 * The value is the band's price, so it is comparable against `close` directly
 * ("close crosses below Supertrend"). The direction is implicit: price above the
 * line means the trend is up.
 *
 * Edge cases:  seeded on the first bar with a defined ATR, in whichever direction
 *              that bar's close implies. The first few bars of any Supertrend are
 *              a guess about a trend nobody has observed yet.
 */
export const supertrendCalculator: IIndicator = {
  name: "supertrend",
  label: "Supertrend",
  defaults: { period: 10, multiplier: 3 },
  warmup: (p) => (p.period ?? 10) + 1,
  stability: (p) => (p.period ?? 10) * 4,

  compute: ({ candles, params }) => {
    const period = params.period ?? 10;
    const multiplier = params.multiplier ?? 3;

    const atr = wilder(trueRange(candles), period);
    const n = candles.length;
    const out: Maybe[] = new Array(n).fill(null);

    let upperBand: number | null = null;
    let lowerBand: number | null = null;
    let uptrend = true;

    for (let i = 0; i < n; i++) {
      const currentAtr = atr[i];
      if (currentAtr === null) continue;

      const candle = candles[i];
      const hl2 = (candle.high + candle.low) / 2;

      const basicUpper = hl2 + multiplier * currentAtr;
      const basicLower = hl2 - multiplier * currentAtr;

      const previousClose = i > 0 ? candles[i - 1].close : candle.close;

      /*
       * THE RATCHET.
       *
       * The lower band may only rise, unless price closed below the old one — in
       * which case the trend is broken and the band resets. Same, mirrored, for
       * the upper band.
       */
      lowerBand =
        lowerBand === null || basicLower > lowerBand || previousClose < lowerBand
          ? basicLower
          : lowerBand;

      upperBand =
        upperBand === null || basicUpper < upperBand || previousClose > upperBand
          ? basicUpper
          : upperBand;

      // The flip. A CLOSE beyond the band, not a wick through it — a wick is the
      // market testing the level, and being stopped out by every test is how a
      // trailing stop becomes a donation.
      if (uptrend && candle.close < lowerBand) uptrend = false;
      else if (!uptrend && candle.close > upperBand) uptrend = true;

      out[i] = uptrend ? lowerBand : upperBand;
    }

    return out;
  },
};

/* ── Parabolic SAR ─────────────────────────────────────────────────── */

/**
 * Parabolic SAR — "stop and reverse". A dot that accelerates toward price.
 *
 * Formula:     SAR[i] = SAR[i-1] + AF·(EP − SAR[i-1])
 *              where EP is the extreme point of the current trend (the highest
 *              high in an uptrend), and AF starts at `step` and increases by
 *              `step` each time a NEW extreme is made, capped at `maxStep`.
 * Defaults:    step 0.02, maxStep 0.2
 * Warmup:      2 bars
 * Complexity:  O(n)
 *
 * ── The two rules that are always missing ──
 *
 * 1. **The AF only increases on a NEW extreme.** Not every bar. An implementation
 *    that increments it every bar accelerates the dot into price and produces a
 *    reversal every few bars, in any market.
 *
 * 2. **The SAR may never enter the last two bars' range.** If the computed SAR
 *    would sit inside the previous two candles, it is clamped to their extreme.
 *    Without this the dot lands *inside* a bar that has already traded through it
 *    — a stop that was already hit before it was placed.
 *
 * Edge cases:  PSAR is famously terrible in a range. It will whipsaw and reverse
 *              constantly, and that is not a bug in this implementation — it is
 *              what the indicator does. It is a trend-following tool and needs a
 *              trend filter (ADX) in front of it.
 */
export const psarCalculator: IIndicator = {
  name: "psar",
  label: "Parabolic SAR",
  defaults: { step: 0.02, maxStep: 0.2 },
  warmup: () => 2,

  compute: ({ candles, params }) => {
    const step = params.step ?? 0.02;
    const maxStep = params.maxStep ?? 0.2;

    const n = candles.length;
    const out: Maybe[] = new Array(n).fill(null);
    if (n < 2) return out;

    // Seed: assume the first bar's direction. Any seed is arbitrary; this one is
    // conventional, and the indicator self-corrects within a few bars.
    let uptrend = candles[1].close >= candles[0].close;
    let sar = uptrend ? candles[0].low : candles[0].high;
    let extreme = uptrend ? candles[0].high : candles[0].low;
    let acceleration = step;

    out[1] = sar;

    for (let i = 2; i < n; i++) {
      const candle = candles[i];
      const previous = candles[i - 1];
      const beforePrevious = candles[i - 2];

      sar = sar + acceleration * (extreme - sar);

      /*
       * THE CLAMP. The SAR cannot sit inside the last two bars' range — that
       * would be a stop placed at a price the market has already traded through.
       */
      if (uptrend) {
        sar = Math.min(sar, previous.low, beforePrevious.low);
      } else {
        sar = Math.max(sar, previous.high, beforePrevious.high);
      }

      // The reversal.
      if (uptrend && candle.low < sar) {
        uptrend = false;
        sar = extreme; // the SAR jumps to the extreme point of the dead trend
        extreme = candle.low;
        acceleration = step;
      } else if (!uptrend && candle.high > sar) {
        uptrend = true;
        sar = extreme;
        extreme = candle.high;
        acceleration = step;
      } else if (uptrend && candle.high > extreme) {
        // A NEW extreme — and ONLY here does the acceleration increase.
        extreme = candle.high;
        acceleration = Math.min(acceleration + step, maxStep);
      } else if (!uptrend && candle.low < extreme) {
        extreme = candle.low;
        acceleration = Math.min(acceleration + step, maxStep);
      }

      out[i] = sar;
    }

    return out;
  },
};

/* ── Ichimoku ──────────────────────────────────────────────────────── */

/**
 * Ichimoku — midpoints of ranges, not moving averages.
 *
 * Every Ichimoku line is `(highest(high, n) + lowest(low, n)) / 2` — the MIDPOINT
 * of the range, which is a different animal from an average of closes. It ignores
 * where price spent its time and cares only where it reached, which is why
 * Ichimoku lines sit flat through consolidations that would drag an EMA around.
 *
 * ── The spans are NOT shifted here ──
 *
 * In its classic form, Span A and Span B are plotted 26 bars into the FUTURE (the
 * cloud ahead of price). We compute them **unshifted, at the bar they are derived
 * from**, and that is deliberate: shifting a series forward means the value at bar
 * `i` was computed from candles at bar `i+26`, which do not exist yet. A strategy
 * reading a forward-shifted span is reading the future. That is look-ahead bias,
 * and it is the exact class of bug this whole platform is built to refuse.
 *
 * The cloud is a *drawing* convention. The values are the values. A rule that
 * wants "price above the cloud" compares price against the spans as computed here,
 * and it is honest.
 *
 * Defaults:    conversion 9, base 26, spanB 52
 * Complexity:  O(n)
 */
function ichimokuLine(
  candles: readonly Candle[],
  period: number,
): Maybe[] {
  const highs = highest(candles.map((c) => c.high), period);
  const lows = lowest(candles.map((c) => c.low), period);

  return highs.map((high, i) => {
    const low = lows[i];
    return high === null || low === null ? null : (high + low) / 2;
  });
}

const ICHIMOKU_DEFAULTS = {
  conversionPeriod: 9,
  basePeriod: 26,
  spanBPeriod: 52,
};

/** Tenkan-sen — the conversion line. The fast one. */
export const ichimokuTenkanCalculator: IIndicator = {
  name: "ichimoku_tenkan",
  label: "Ichimoku conversion (Tenkan)",
  defaults: ICHIMOKU_DEFAULTS,
  warmup: (p) => p.conversionPeriod ?? 9,
  compute: ({ candles, params }) =>
    ichimokuLine(candles, params.conversionPeriod ?? 9),
};

/** Kijun-sen — the base line. The one price returns to. */
export const ichimokuKijunCalculator: IIndicator = {
  name: "ichimoku_kijun",
  label: "Ichimoku base (Kijun)",
  defaults: ICHIMOKU_DEFAULTS,
  warmup: (p) => p.basePeriod ?? 26,
  compute: ({ candles, params }) => ichimokuLine(candles, params.basePeriod ?? 26),
};

/**
 * Senkou Span A — the midpoint of Tenkan and Kijun.
 *
 * Unshifted. See the note above: shifting it forward would make it a value
 * derived from candles that have not happened.
 */
export const ichimokuSpanACalculator: IIndicator = {
  name: "ichimoku_span_a",
  label: "Ichimoku span A",
  defaults: ICHIMOKU_DEFAULTS,
  warmup: (p) => Math.max(p.conversionPeriod ?? 9, p.basePeriod ?? 26),

  compute: ({ candles, params }) => {
    const tenkan = ichimokuLine(candles, params.conversionPeriod ?? 9);
    const kijun = ichimokuLine(candles, params.basePeriod ?? 26);

    return tenkan.map((t, i) => {
      const k = kijun[i];
      return t === null || k === null ? null : (t + k) / 2;
    });
  },
};

/** Senkou Span B — the midpoint of the long range. The cloud's slow edge. */
export const ichimokuSpanBCalculator: IIndicator = {
  name: "ichimoku_span_b",
  label: "Ichimoku span B",
  defaults: ICHIMOKU_DEFAULTS,
  warmup: (p) => p.spanBPeriod ?? 52,
  compute: ({ candles, params }) =>
    ichimokuLine(candles, params.spanBPeriod ?? 52),
};
