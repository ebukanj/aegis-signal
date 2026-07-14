import type { Indicator, IndicatorParams } from "@aegis/contracts";
import type { IIndicator, IndicatorContext } from "../../domain/indicator.interface";
import { extractSource } from "../math/source";
import { cumulative, ema, sma, type Maybe } from "../math/rolling";

/* ── Price ─────────────────────────────────────────────────────────────
 *
 * Trivial, and they must exist anyway: a strategy condition is
 * `[operand] [operator] [operand]`, and "close crosses above EMA(50)" needs
 * `close` to be an operand the registry can resolve like any other. Special-casing
 * price in the evaluator would mean two code paths where one will do — and the
 * one that is used less is the one that will be wrong.
 *
 * Formula:     the candle field itself
 * Warmup:      1 bar
 * Complexity:  O(n)
 * Edge cases:  none — price always exists, or the candle was rejected at the
 *              market boundary and never reached us
 */
class PriceCalculator implements IIndicator {
  readonly defaults: IndicatorParams = {};

  constructor(
    readonly name: Indicator,
    readonly label: string,
    private readonly field: "open" | "high" | "low" | "close",
  ) {}

  warmup(): number {
    return 1;
  }

  compute({ candles }: IndicatorContext): Maybe[] {
    return extractSource(candles, this.field);
  }
}

export const openCalculator = new PriceCalculator("open", "Open", "open");
export const highCalculator = new PriceCalculator("high", "High", "high");
export const lowCalculator = new PriceCalculator("low", "Low", "low");
export const closeCalculator = new PriceCalculator("close", "Close", "close");

/* ── Volume ────────────────────────────────────────────────────────── */

/**
 * Volume.
 *
 * Formula:     the candle's base-asset volume
 * Warmup:      1 bar
 * Complexity:  O(n)
 * Edge cases:  zero on a dead bar is REAL and is kept. Zero volume genuinely
 *              happens on illiquid pairs, and a strategy gating on liquidity
 *              needs to see it rather than have it smoothed away.
 */
export const volumeCalculator: IIndicator = {
  name: "volume",
  label: "Volume",
  defaults: {},
  warmup: () => 1,
  compute: ({ candles }) => candles.map((c) => c.volume),
};

/**
 * Volume SMA — "is this bar's volume unusual?"
 *
 * Formula:     SMA(volume, period)
 * Defaults:    period 20
 * Warmup:      `period` bars
 * Complexity:  O(n)
 * Edge cases:  a period of 1 is legal and useless (it is volume)
 */
export const volumeSmaCalculator: IIndicator = {
  name: "volume_sma",
  label: "Volume average",
  defaults: { period: 20 },
  warmup: (p) => p.period ?? 20,
  compute: ({ candles, params }) =>
    sma(
      candles.map((c) => c.volume),
      params.period ?? 20,
    ),
};

/**
 * On-Balance Volume — a running total that adds volume on up bars and subtracts
 * it on down bars.
 *
 * Formula:     OBV[i] = OBV[i-1] + (close > prev ? +v : close < prev ? -v : 0)
 * Warmup:      2 bars (needs a previous close to have a direction)
 * Complexity:  O(n)
 *
 * ── What OBV actually knows, and what it does not ──
 *
 * OBV assumes the whole bar's volume belongs to whoever won the bar. That is a
 * guess, and on a bar that closed up 0.1% after a violent two-way fight it is a
 * bad one. OBV is a proxy for pressure; CVD (below) is a measurement of it. Where
 * both are available, prefer CVD — and this is exactly why the platform went to
 * the trouble of carrying taker-buy volume.
 *
 * ── Absolute level is meaningless ──
 *
 * OBV's level depends entirely on where the series started. Only its SLOPE and
 * its DIVERGENCE from price carry information, which is why the strategy
 * vocabulary exposes `rising` / `falling` / `diverges_*` and no threshold
 * comparison would mean anything.
 */
export const obvCalculator: IIndicator = {
  name: "obv",
  label: "On-balance volume",
  defaults: {},
  warmup: () => 2,

  compute: ({ candles }) => {
    const signed: Maybe[] = new Array(candles.length).fill(null);

    for (let i = 1; i < candles.length; i++) {
      const previous = candles[i - 1].close;
      const current = candles[i];

      if (current.close > previous) signed[i] = current.volume;
      else if (current.close < previous) signed[i] = -current.volume;
      else signed[i] = 0; // an unchanged close is genuinely no information
    }

    return cumulative(signed);
  },
};

/**
 * Cumulative Volume Delta — the running total of (buy volume − sell volume).
 *
 * Formula:     delta[i] = takerBuyVolume − (volume − takerBuyVolume)
 *                       = 2·takerBuyVolume − volume
 *              CVD[i]   = CVD[i-1] + delta[i]
 * Warmup:      1 bar
 * Complexity:  O(n)
 *
 * ── Why this is worth carrying an extra column for ──
 *
 * OBV guesses at who was in control by looking at where the bar closed. CVD does
 * not guess: `takerBuyVolume` is the volume that was buyers *crossing the spread*
 * — hitting the ask because they wanted in now — and the rest was sellers doing
 * the same on the bid. It is the difference between inferring intent and
 * measuring it.
 *
 * The signature it exposes is the one Support Reclaim reads: **CVD rising while
 * price goes nowhere.** Buyers are absorbing everything the sellers can throw at
 * them, and price has not moved yet. That is accumulation, and it looks like
 * nothing at all on a price chart.
 *
 * It also separates forced selling from conviction selling. A liquidation cascade
 * dumps into bids and craters CVD in seconds; holders quietly leaving bleeds it
 * over hours. Price falls the same way in both. What happens next does not.
 *
 * ── The null ──
 *
 * **Bybit does not publish taker-buy volume, so CVD is `null` there — the whole
 * series, not a zero.** A zero delta would claim "buyers and sellers were exactly
 * balanced this bar", which is a statement about the market that a strategy would
 * trade on. Null says "we cannot see it", and the strategy stands down. That is
 * the same rule funding rate follows, and it is why `takerBuyVolume` is nullable
 * in the contract rather than defaulted.
 */
export const cvdCalculator: IIndicator = {
  name: "cvd",
  label: "Cumulative volume delta",
  defaults: {},
  warmup: () => 1,

  compute: ({ candles }) => {
    const deltas: Maybe[] = candles.map((candle) => {
      if (candle.takerBuyVolume === null) return null;

      const sellVolume = candle.volume - candle.takerBuyVolume;
      return candle.takerBuyVolume - sellVolume;
    });

    /*
     * One missing bar does not poison the whole series — but it does break the
     * running total, because a cumulative sum across a hole is a sum of two
     * different things. `cumulative` restarts after a null, and the nulls stay
     * visible in the output so nothing downstream mistakes a fresh start for a
     * continuous history.
     */
    return cumulative(deltas);
  },
};

/**
 * VWAP — volume-weighted average price, anchored to the UTC day.
 *
 * Formula:     Σ(hlc3 · volume) / Σ(volume), reset at 00:00 UTC
 * Warmup:      1 bar
 * Complexity:  O(n)
 *
 * ── Anchored, not rolling ──
 *
 * VWAP is a SESSION statistic: "what has the average buyer paid today?" A rolling
 * 20-bar VWAP is a different, much less useful thing — institutions benchmark
 * against the session, and the reason VWAP acts as support is that it is the line
 * a lot of size is trying not to be underwater against.
 *
 * Crypto has no trading session, so the convention (and TradingView's default) is
 * the UTC day. The reset is what makes it VWAP rather than a weighted moving
 * average, and it means the first bar of each UTC day has a VWAP equal to its own
 * typical price — correct, and briefly useless, which is honest.
 *
 * Edge cases:  a zero-volume bar contributes nothing and does not reset the
 *              anchor. A whole day of zero volume yields null rather than 0/0.
 */
export const vwapCalculator: IIndicator = {
  name: "vwap",
  label: "VWAP",
  defaults: {},
  warmup: () => 1,

  compute: ({ candles }) => {
    const out: Maybe[] = new Array(candles.length).fill(null);

    let day = -1;
    let priceVolume = 0;
    let volume = 0;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const candleDay = Math.floor(candle.time / DAY_MS);

      if (candleDay !== day) {
        day = candleDay;
        priceVolume = 0;
        volume = 0;
      }

      const typical = (candle.high + candle.low + candle.close) / 3;
      priceVolume += typical * candle.volume;
      volume += candle.volume;

      // No volume yet today — there is no "average price paid" to report.
      out[i] = volume > 0 ? priceVolume / volume : null;
    }

    return out;
  },
};

const DAY_MS = 24 * 60 * 60 * 1_000;

/* ── Moving averages ───────────────────────────────────────────────── */

/**
 * Simple moving average.
 *
 * Formula:     Σ(source, period) / period
 * Defaults:    period 20, source close
 * Warmup:      `period` bars — and it is EXACT. Unlike EMA, an SMA(200) computed
 *              from exactly 200 bars is the same number as one computed from
 *              2,000. It has no memory beyond its window.
 * Complexity:  O(n), Kahan-compensated
 */
export const smaCalculator: IIndicator = {
  name: "sma",
  label: "Simple moving average",
  defaults: { period: 20, source: "close" },
  warmup: (p) => p.period ?? 20,
  compute: ({ candles, params }) =>
    sma(extractSource(candles, params.source ?? "close"), params.period ?? 20),
};

/**
 * Exponential moving average.
 *
 * Formula:     EMA[i] = source[i]·α + EMA[i-1]·(1−α),  α = 2/(period+1)
 *              seeded with SMA(source, period) — TradingView's convention
 * Defaults:    period 20, source close
 * Warmup:      `period` bars until DEFINED
 * Stability:   ~3·period bars until TRUSTWORTHY, and the difference is real —
 *              an EMA is recursive, so it never entirely forgets its seed. An
 *              EMA(200) built from exactly 200 bars is measurably not the same
 *              number as one built from 1,000, and a strategy that fires on
 *              "price crosses the 200 EMA" would fire at a different moment.
 *              3·period puts the seed's residual weight below ~0.1%.
 * Complexity:  O(n)
 */
export const emaCalculator: IIndicator = {
  name: "ema",
  label: "Exponential moving average",
  defaults: { period: 20, source: "close" },
  warmup: (p) => p.period ?? 20,
  stability: (p) => (p.period ?? 20) * 3,
  compute: ({ candles, params }) => {
    const source = extractSource(candles, params.source ?? "close");
    return ema(source, params.period ?? 20);
  },
};
