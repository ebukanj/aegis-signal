import type { Indicator, IndicatorParams } from "@aegis/contracts";
import type { IIndicator } from "../../domain/indicator.interface";
import { extractSource, trueRange } from "../math/source";
import {
  ema,
  highest,
  lowest,
  sma,
  stdev,
  wilder,
  type Maybe,
} from "../math/rolling";
import { FeedUnavailableError } from "../../domain/indicator.errors";

/* ── ATR ───────────────────────────────────────────────────────────── */

/**
 * Average True Range — the single most consequential number this engine produces.
 *
 * Formula:     Wilder(TrueRange, period)
 * Defaults:    period 14
 * Warmup:      period + 1 bars
 * Stability:   ~4·period (Wilder is recursive)
 * Complexity:  O(n)
 *
 * ── Why this one, above all, must be right ──
 *
 * ATR is not decoration on a chart. The Risk Engine sizes every position from it:
 * the stop is placed some multiple of ATR from entry, and the position size is
 * `(equity × risk%) / stopDistance`. An ATR that is 20% too small produces a stop
 * 20% too tight and a position 25% too large — so the trade is stopped out by
 * noise it should have survived, and it loses more than it was ever supposed to
 * risk when it does. Both failures at once, from one wrong number.
 *
 * Which is why it is Wilder's smoothing here and not an EMA. The difference is
 * roughly 2× in the smoothing constant, and it lands directly on the stop.
 */
export const atrCalculator: IIndicator = {
  name: "atr",
  label: "ATR",
  defaults: { period: 14 },
  warmup: (p) => (p.period ?? 14) + 1,
  stability: (p) => (p.period ?? 14) * 4,
  compute: ({ candles, params }) =>
    wilder(trueRange(candles), params.period ?? 14),
};

/* ── Bollinger Bands ───────────────────────────────────────────────── */

/**
 * The three Bollinger series, computed once.
 *
 * POPULATION standard deviation (÷n), not sample (÷n−1) — see `stdev`. The sample
 * deviation is slightly larger, which widens every band, which quietly loosens
 * every "price outside the band" condition in the platform.
 */
function bollinger(
  source: readonly number[],
  period: number,
  multiplier: number,
): { upper: Maybe[]; middle: Maybe[]; lower: Maybe[]; width: Maybe[] } {
  const middle = sma(source, period);
  const deviation = stdev(source, period);

  const upper: Maybe[] = new Array(source.length).fill(null);
  const lower: Maybe[] = new Array(source.length).fill(null);
  const width: Maybe[] = new Array(source.length).fill(null);

  for (let i = 0; i < source.length; i++) {
    const mid = middle[i];
    const dev = deviation[i];
    if (mid === null || dev === null) continue;

    upper[i] = mid + multiplier * dev;
    lower[i] = mid - multiplier * dev;

    /*
     * Width is normalised by the middle band, deliberately.
     *
     * The raw band gap is in price units, so BTC's is thousands and DOGE's is
     * thousandths — utterly incomparable, and a "squeeze" threshold tuned on one
     * is meaningless on the other. Dividing by the middle band makes it a
     * fraction of price, and "width below 0.04" then means the same thing on every
     * instrument in the universe. That is what makes a squeeze detectable at all.
     */
    width[i] = mid === 0 ? null : (upper[i]! - lower[i]!) / mid;
  }

  return { upper, middle, lower, width };
}

const BB_DEFAULTS: IndicatorParams = {
  period: 20,
  multiplier: 2,
  source: "close",
};

function bollingerOf(name: Indicator, label: string, pick: "upper" | "middle" | "lower" | "width"): IIndicator {
  return {
    name,
    label,
    defaults: BB_DEFAULTS,
    warmup: (p) => p.period ?? 20,
    compute: ({ candles, params }) =>
      bollinger(
        extractSource(candles, params.source ?? "close"),
        params.period ?? 20,
        params.multiplier ?? 2,
      )[pick],
  };
}

/**
 * Bollinger upper / middle / lower.
 *
 * Formula:     middle = SMA(source, period)
 *              upper  = middle + multiplier · populationStdev
 *              lower  = middle − multiplier · populationStdev
 * Defaults:    period 20, multiplier 2, source close
 * Warmup:      `period` bars — exact, no recursion, no seed memory
 * Complexity:  O(n·period) for the deviation (Welford, per window)
 * Edge cases:  a dead-flat window has zero deviation, so all three bands collapse
 *              onto the price. That is correct and is what a frozen market is.
 */
export const bbUpperCalculator = bollingerOf("bb_upper", "Bollinger upper", "upper");
export const bbMiddleCalculator = bollingerOf("bb_middle", "Bollinger middle", "middle");
export const bbLowerCalculator = bollingerOf("bb_lower", "Bollinger lower", "lower");

/**
 * Bollinger width — the squeeze detector.
 *
 * Formula:     (upper − lower) / middle
 * Edge cases:  a middle band of 0 is impossible for a price series (the market
 *              boundary refuses zero prices), but is guarded rather than allowed
 *              to produce an Infinity that would propagate silently.
 */
export const bbWidthCalculator = bollingerOf("bb_width", "Bollinger width", "width");

/* ── Keltner Channels ──────────────────────────────────────────────── */

/**
 * Keltner Channels — an EMA with ATR bands.
 *
 * Formula:     middle = EMA(close, period)
 *              upper  = middle + multiplier · ATR(period)
 *              lower  = middle − multiplier · ATR(period)
 * Defaults:    period 20, multiplier 2
 * Warmup:      period + 1 bars
 * Complexity:  O(n)
 *
 * ── Why both Keltner AND Bollinger ──
 *
 * They measure different things, and the difference between them is itself a
 * signal. Bollinger uses standard deviation of CLOSES; Keltner uses ATR, which
 * includes gaps and wicks. So Bollinger reacts to closes clustering, Keltner to
 * the market's actual range.
 *
 * When the Bollinger bands contract INSIDE the Keltner channels, that is the
 * classic "squeeze": closes have gone quiet while the true range has not yet
 * collapsed. It is one of the few genuinely predictive volatility setups, and it
 * is only expressible because both are in the vocabulary.
 */
function keltner(
  candles: Parameters<typeof trueRange>[0],
  closes: readonly number[],
  period: number,
  multiplier: number,
): { upper: Maybe[]; lower: Maybe[] } {
  const middle = ema(closes, period);
  const atr = wilder(trueRange(candles), period);

  const upper: Maybe[] = new Array(closes.length).fill(null);
  const lower: Maybe[] = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    const mid = middle[i];
    const range = atr[i];
    if (mid === null || range === null) continue;

    upper[i] = mid + multiplier * range;
    lower[i] = mid - multiplier * range;
  }

  return { upper, lower };
}

const KELTNER_DEFAULTS: IndicatorParams = { period: 20, multiplier: 2 };

export const keltnerUpperCalculator: IIndicator = {
  name: "keltner_upper",
  label: "Keltner upper",
  defaults: KELTNER_DEFAULTS,
  warmup: (p) => (p.period ?? 20) + 1,
  compute: ({ candles, params }) =>
    keltner(
      candles,
      candles.map((c) => c.close),
      params.period ?? 20,
      params.multiplier ?? 2,
    ).upper,
};

export const keltnerLowerCalculator: IIndicator = {
  name: "keltner_lower",
  label: "Keltner lower",
  defaults: KELTNER_DEFAULTS,
  warmup: (p) => (p.period ?? 20) + 1,
  compute: ({ candles, params }) =>
    keltner(
      candles,
      candles.map((c) => c.close),
      params.period ?? 20,
      params.multiplier ?? 2,
    ).lower,
};

/* ── Donchian Channels ─────────────────────────────────────────────── */

/**
 * Donchian Channels — the highest high and the lowest low. That is all.
 *
 * Formula:     upper = highest(high, period),  lower = lowest(low, period)
 * Defaults:    period 20
 * Warmup:      `period` bars
 * Complexity:  O(n) via a monotonic deque
 *
 * ── Deliberately excludes the current bar? No. And that matters. ──
 *
 * Our Donchian INCLUDES the current bar, which means price can never close above
 * the upper channel — it would BE the upper channel. A breakout rule written as
 * "close > donchian_upper" would therefore never fire.
 *
 * The correct expression of a breakout against this indicator is
 * `close crosses_above highest_high(period)` evaluated against the PREVIOUS bar's
 * level, which is exactly what the `crosses_above` operator does: it compares
 * this bar's close against the previous bar's indicator value. The operator
 * handles the offset so the indicator does not have to lie about its own window.
 */
export const donchianUpperCalculator: IIndicator = {
  name: "donchian_upper",
  label: "Donchian upper",
  defaults: { period: 20 },
  warmup: (p) => p.period ?? 20,
  compute: ({ candles, params }) =>
    highest(candles.map((c) => c.high), params.period ?? 20),
};

export const donchianLowerCalculator: IIndicator = {
  name: "donchian_lower",
  label: "Donchian lower",
  defaults: { period: 20 },
  warmup: (p) => p.period ?? 20,
  compute: ({ candles, params }) =>
    lowest(candles.map((c) => c.low), params.period ?? 20),
};

/* ── Structure ─────────────────────────────────────────────────────── */

/**
 * Highest high / lowest low over N bars.
 *
 * The raw material of every breakout and every stop placement. Identical to the
 * Donchian channels by construction — they exist under both names because a
 * trader writing a strategy reaches for "highest high" and a trader reading a
 * chart reaches for "Donchian", and the vocabulary should meet them both where
 * they are rather than making one of them learn the other's word.
 *
 * Complexity:  O(n)
 */
export const highestHighCalculator: IIndicator = {
  name: "highest_high",
  label: "Highest high",
  defaults: { period: 20 },
  warmup: (p) => p.period ?? 20,
  compute: ({ candles, params }) =>
    highest(candles.map((c) => c.high), params.period ?? 20),
};

export const lowestLowCalculator: IIndicator = {
  name: "lowest_low",
  label: "Lowest low",
  defaults: { period: 20 },
  warmup: (p) => p.period ?? 20,
  compute: ({ candles, params }) =>
    lowest(candles.map((c) => c.low), params.period ?? 20),
};

/* ── Statistics ────────────────────────────────────────────────────── */

/**
 * Z-score — how many standard deviations is price from its own mean?
 *
 * Formula:     (source − SMA(source, n)) / populationStdev(source, n)
 * Defaults:    period 20, source close
 * Warmup:      `period` bars
 * Complexity:  O(n·period)
 *
 * ── The one indicator that is unit-free ──
 *
 * This is what makes cross-asset comparison possible at all. "BTC moved $400" and
 * "DOGE moved $0.0004" cannot be ranked against each other; "BTC is 2.1σ from its
 * mean" and "DOGE is 3.4σ from its mean" can. The Scanner's ranking depends on
 * exactly this property.
 *
 * Edge cases:  zero deviation → null, not 0. A z-score of 0 means "exactly at the
 *              mean", which is a strong claim about a market that has simply not
 *              moved. Undefined is the truth.
 */
export const zscoreCalculator: IIndicator = {
  name: "zscore",
  label: "Z-score",
  defaults: { period: 20, source: "close" },
  warmup: (p) => p.period ?? 20,

  compute: ({ candles, params }) => {
    const period = params.period ?? 20;
    const source = extractSource(candles, params.source ?? "close");

    const means = sma(source, period);
    const deviations = stdev(source, period);

    return means.map((mean, i) => {
      const deviation = deviations[i];
      if (mean === null || deviation === null || deviation === 0) return null;

      return (source[i] - mean) / deviation;
    });
  },
};

/* ── Derivatives — declared, and deliberately unavailable ──────────── */

/**
 * Funding rate, open interest, long/short ratio.
 *
 * **These are not computed from candles and never will be.** They are separate
 * exchange feeds, and the platform does not yet collect them. They are registered
 * anyway, and they throw `FeedUnavailableError`.
 *
 * That is a deliberate choice over simply leaving them out of the registry. An
 * indicator MISSING from the registry is a bug — something the platform should
 * know and does not. An indicator that is PRESENT and says "I have no feed" is a
 * fact about the world, and a strategy that depends on one stands down cleanly
 * rather than crashing. Crowd Squeeze already ships DISABLED for exactly this
 * reason (06-STRATEGIES §3), and it should read as a known limitation rather than
 * a defect.
 *
 * When the derivatives feed lands, these three files change and nothing else does.
 */
function unavailable(name: Indicator, label: string): IIndicator {
  return {
    name,
    label,
    defaults: {},
    warmup: () => 1,
    compute: () => {
      throw new FeedUnavailableError(name);
    },
  };
}

export const fundingRateCalculator = unavailable("funding_rate", "Funding rate");
export const openInterestCalculator = unavailable("open_interest", "Open interest");
export const longShortRatioCalculator = unavailable(
  "long_short_ratio",
  "Long/short ratio",
);
