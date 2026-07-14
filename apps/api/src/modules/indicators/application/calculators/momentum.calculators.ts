import type { Candle } from "@aegis/contracts";
import type { IIndicator } from "../../domain/indicator.interface";
import { extractSource } from "../math/source";
import {
  change,
  ema,
  highest,
  lowest,
  sma,
  wilder,
  type Maybe,
} from "../math/rolling";

/**
 * Momentum — how fast, and is it slowing?
 *
 * These are the indicators most likely to disagree with TradingView, and always
 * for the same two reasons: **Wilder smoothing vs EMA**, and **seeding**. Both are
 * settled once, here, and every calculator below routes through the shared
 * helpers rather than rolling its own.
 */

/* ── RSI ───────────────────────────────────────────────────────────── */

/**
 * Relative Strength Index.
 *
 * Formula:     RS  = WilderAvg(gains, period) / WilderAvg(losses, period)
 *              RSI = 100 − 100/(1 + RS)
 * Defaults:    period 14, source close
 * Warmup:      period + 1 bars (the +1 is the first bar's change)
 * Stability:   ~4·period — Wilder smoothing is recursive and decays its seed
 *              slowly. An RSI(14) from exactly 15 bars is not the RSI(14) you
 *              would get from 200 bars ending at the same candle, and 30 vs 32
 *              is the difference between "oversold" firing and not.
 * Complexity:  O(n)
 *
 * ── WILDER, not EMA ──
 *
 * Wilder's α is 1/period. The ordinary EMA's is 2/(period+1). For period 14 that
 * is 0.0714 against 0.1333 — nearly double. Using the wrong one produces an RSI
 * that is wrong by several points, which is more than enough to sit on the
 * correct side of a 30/70 threshold while the truth sits on the other. This is
 * the single most common way an RSI implementation is quietly broken.
 *
 * Edge cases:  a period with zero losses gives RS = ∞ → RSI = 100, which is
 *              correct and is what an unbroken run of green bars means. Handled
 *              explicitly rather than left to produce a NaN.
 */
export const rsiCalculator: IIndicator = {
  name: "rsi",
  label: "RSI",
  defaults: { period: 14, source: "close" },
  warmup: (p) => (p.period ?? 14) + 1,
  stability: (p) => (p.period ?? 14) * 4,

  compute: ({ candles, params }) => {
    const period = params.period ?? 14;
    const source = extractSource(candles, params.source ?? "close");
    const deltas = change(source, 1);

    const gains: Maybe[] = deltas.map((d) => (d === null ? null : Math.max(d, 0)));
    const losses: Maybe[] = deltas.map((d) => (d === null ? null : Math.max(-d, 0)));

    const avgGain = wilder(gains, period);
    const avgLoss = wilder(losses, period);

    return avgGain.map((gain, i) => {
      const loss = avgLoss[i];
      if (gain === null || loss === null) return null;

      // Not a divide-by-zero to be papered over: zero average loss means there
      // were no down bars in the window, and an RSI of 100 is exactly what that
      // means.
      if (loss === 0) return 100;

      const rs = gain / loss;
      return 100 - 100 / (1 + rs);
    });
  },
};

/* ── MACD ──────────────────────────────────────────────────────────── */

/**
 * The three MACD series, computed once.
 *
 * The contract exposes `macd_line`, `macd_signal` and `macd_histogram` as three
 * separate indicators, because a strategy condition names exactly one. They are
 * three views of one calculation, so they share it — the histogram is derived
 * from the other two, and computing it independently would risk it disagreeing
 * with them.
 */
function macd(
  source: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): { line: Maybe[]; signal: Maybe[]; histogram: Maybe[] } {
  const fast = ema(source, fastPeriod);
  const slow = ema(source, slowPeriod);

  const line: Maybe[] = fast.map((f, i) => {
    const s = slow[i];
    return f === null || s === null ? null : f - s;
  });

  /*
   * The signal line is an EMA *of the MACD line*, and the MACD line starts with
   * nulls. `ema` treats a null as a discontinuity and restarts — which is
   * precisely right here: the signal EMA must begin its seed at the MACD line's
   * first real value, not before it.
   */
  const signal = ema(line, signalPeriod);

  const histogram: Maybe[] = line.map((l, i) => {
    const s = signal[i];
    return l === null || s === null ? null : l - s;
  });

  return { line, signal, histogram };
}

const MACD_DEFAULTS = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 };

/**
 * MACD line — the gap between a fast and a slow EMA.
 *
 * Formula:     EMA(source, fast) − EMA(source, slow)
 * Defaults:    12 / 26 / 9, source close
 * Warmup:      `slowPeriod` bars
 * Stability:   ~3·slowPeriod (it inherits the EMA's memory of its seed)
 * Complexity:  O(n)
 * Edge cases:  fast ≥ slow is legal arithmetic and meaningless as an indicator;
 *              the validator rejects it rather than returning a mirrored curve.
 */
export const macdLineCalculator: IIndicator = {
  name: "macd_line",
  label: "MACD line",
  defaults: { ...MACD_DEFAULTS, source: "close" },
  warmup: (p) => p.slowPeriod ?? 26,
  stability: (p) => (p.slowPeriod ?? 26) * 3,
  compute: ({ candles, params }) =>
    macd(
      extractSource(candles, params.source ?? "close"),
      params.fastPeriod ?? 12,
      params.slowPeriod ?? 26,
      params.signalPeriod ?? 9,
    ).line,
};

/**
 * MACD signal — an EMA of the MACD line.
 *
 * Warmup:      slowPeriod + signalPeriod bars
 * Complexity:  O(n)
 */
export const macdSignalCalculator: IIndicator = {
  name: "macd_signal",
  label: "MACD signal",
  defaults: { ...MACD_DEFAULTS, source: "close" },
  warmup: (p) => (p.slowPeriod ?? 26) + (p.signalPeriod ?? 9),
  stability: (p) => ((p.slowPeriod ?? 26) + (p.signalPeriod ?? 9)) * 3,
  compute: ({ candles, params }) =>
    macd(
      extractSource(candles, params.source ?? "close"),
      params.fastPeriod ?? 12,
      params.slowPeriod ?? 26,
      params.signalPeriod ?? 9,
    ).signal,
};

/**
 * MACD histogram — line minus signal.
 *
 * The one of the three that carries the most information, because its SLOPE turns
 * before the lines cross. "Histogram rising for 3 bars" is momentum returning
 * while the crossover has not happened yet; by the time the lines cross, a good
 * part of the move has usually gone.
 *
 * Warmup:      slowPeriod + signalPeriod bars
 * Complexity:  O(n)
 */
export const macdHistogramCalculator: IIndicator = {
  name: "macd_histogram",
  label: "MACD histogram",
  defaults: { ...MACD_DEFAULTS, source: "close" },
  warmup: (p) => (p.slowPeriod ?? 26) + (p.signalPeriod ?? 9),
  stability: (p) => ((p.slowPeriod ?? 26) + (p.signalPeriod ?? 9)) * 3,
  compute: ({ candles, params }) =>
    macd(
      extractSource(candles, params.source ?? "close"),
      params.fastPeriod ?? 12,
      params.slowPeriod ?? 26,
      params.signalPeriod ?? 9,
    ).histogram,
};

/* ── Stochastic ────────────────────────────────────────────────────── */

/**
 * Raw %K — where is the close within its recent range?
 *
 * Formula:     100 · (close − lowest(low, k)) / (highest(high, k) − lowest(low, k))
 * Edge case:   a FLAT range (highest === lowest) is a division by zero. Every
 *              answer is defensible and most libraries return 0, which reads as
 *              "maximally oversold" — on a bar where price did not move at all.
 *              A dead-flat window is not oversold, it is *undefined*, and 50
 *              (the exact middle) is the only value that asserts nothing. We
 *              return 50 and document it, because returning 0 would have
 *              strategies buying frozen markets.
 */
function rawStochK(candles: readonly Candle[], kPeriod: number): Maybe[] {
  const highs = highest(candles.map((c) => c.high), kPeriod);
  const lows = lowest(candles.map((c) => c.low), kPeriod);

  return candles.map((candle, i) => {
    const high = highs[i];
    const low = lows[i];
    if (high === null || low === null) return null;

    const range = high - low;
    if (range === 0) return 50;

    return ((candle.close - low) / range) * 100;
  });
}

/**
 * Stochastic %K — the SMOOTHED one.
 *
 * TradingView's "Stoch %K" is raw %K smoothed by `smoothing` (default 3), NOT the
 * raw line. Plotting raw %K and calling it %K is a common and confusing bug: the
 * raw line is far noisier and crosses its signal constantly.
 *
 * Formula:     SMA(rawK, smoothing)
 * Defaults:    kPeriod 14, dPeriod 3, smoothing 3
 * Warmup:      kPeriod + smoothing − 1
 * Complexity:  O(n)
 */
export const stochKCalculator: IIndicator = {
  name: "stoch_k",
  label: "Stochastic %K",
  defaults: { kPeriod: 14, dPeriod: 3, smoothing: 3 },
  warmup: (p) => (p.kPeriod ?? 14) + (p.smoothing ?? 3) - 1,
  compute: ({ candles, params }) =>
    sma(rawStochK(candles, params.kPeriod ?? 14), params.smoothing ?? 3),
};

/**
 * Stochastic %D — the signal line: an SMA of %K.
 *
 * Warmup:      kPeriod + smoothing + dPeriod − 2
 * Complexity:  O(n)
 */
export const stochDCalculator: IIndicator = {
  name: "stoch_d",
  label: "Stochastic %D",
  defaults: { kPeriod: 14, dPeriod: 3, smoothing: 3 },
  warmup: (p) => (p.kPeriod ?? 14) + (p.smoothing ?? 3) + (p.dPeriod ?? 3) - 2,
  compute: ({ candles, params }) => {
    const k = sma(rawStochK(candles, params.kPeriod ?? 14), params.smoothing ?? 3);
    return sma(k, params.dPeriod ?? 3);
  },
};

/* ── KDJ ───────────────────────────────────────────────────────────── */

/**
 * KDJ — the stochastic, as the Chinese and Asian desks actually use it.
 *
 * Bybit's TradeGPT leans on this, which is why it is in the vocabulary
 * (06-STRATEGIES). It differs from the western Stochastic in two ways that matter:
 *
 *   1. K and D are smoothed with a **1/3 recursive average**, not an SMA. The
 *      recursion is `K = (2·K_prev + rawK)/3` — a Wilder-style smoother with
 *      period 3, seeded at 50.
 *   2. **J = 3K − 2D**, which is the whole point. J overshoots: it can go far
 *      above 100 and far below 0, and those excursions are the signal. A J below
 *      0 is a genuine capitulation reading that neither K nor D can express,
 *      because both are clamped to [0, 100] by construction.
 *
 * Formula:     K = (2·K_prev + rawK)/3,  D = (2·D_prev + K)/3,  J = 3K − 2D
 * Defaults:    kPeriod 9, dPeriod 3, smoothing 3   (the standard 9,3,3)
 * Warmup:      kPeriod bars
 * Stability:   kPeriod + 20 — the recursion is seeded at 50 and takes ~20 bars
 *              to forget it.
 * Complexity:  O(n)
 * Edge cases:  J is deliberately NOT clamped. Clamping it to [0,100] would
 *              destroy the only thing it is for.
 */
function kdj(
  candles: readonly Candle[],
  kPeriod: number,
): { k: Maybe[]; d: Maybe[]; j: Maybe[] } {
  const raw = rawStochK(candles, kPeriod);

  const k: Maybe[] = new Array(candles.length).fill(null);
  const d: Maybe[] = new Array(candles.length).fill(null);
  const j: Maybe[] = new Array(candles.length).fill(null);

  // Seeded at 50 — the convention, and the only neutral starting point.
  let previousK = 50;
  let previousD = 50;

  for (let i = 0; i < candles.length; i++) {
    const rawK = raw[i];
    if (rawK === null) continue;

    previousK = (2 * previousK + rawK) / 3;
    previousD = (2 * previousD + previousK) / 3;

    k[i] = previousK;
    d[i] = previousD;
    j[i] = 3 * previousK - 2 * previousD;
  }

  return { k, d, j };
}

const KDJ_DEFAULTS = { kPeriod: 9, dPeriod: 3, smoothing: 3 };

export const kdjKCalculator: IIndicator = {
  name: "kdj_k",
  label: "KDJ %K",
  defaults: KDJ_DEFAULTS,
  warmup: (p) => p.kPeriod ?? 9,
  stability: (p) => (p.kPeriod ?? 9) + 20,
  compute: ({ candles, params }) => kdj(candles, params.kPeriod ?? 9).k,
};

export const kdjDCalculator: IIndicator = {
  name: "kdj_d",
  label: "KDJ %D",
  defaults: KDJ_DEFAULTS,
  warmup: (p) => p.kPeriod ?? 9,
  stability: (p) => (p.kPeriod ?? 9) + 20,
  compute: ({ candles, params }) => kdj(candles, params.kPeriod ?? 9).d,
};

export const kdjJCalculator: IIndicator = {
  name: "kdj_j",
  label: "KDJ %J",
  defaults: KDJ_DEFAULTS,
  warmup: (p) => p.kPeriod ?? 9,
  stability: (p) => (p.kPeriod ?? 9) + 20,
  compute: ({ candles, params }) => kdj(candles, params.kPeriod ?? 9).j,
};

/* ── CCI ───────────────────────────────────────────────────────────── */

/**
 * Commodity Channel Index.
 *
 * Formula:     (typical − SMA(typical, n)) / (0.015 · meanDeviation)
 * Defaults:    period 20, source hlc3
 * Warmup:      `period` bars
 * Complexity:  O(n·period) — see below
 *
 * ── MEAN deviation, not STANDARD deviation ──
 *
 * CCI uses the mean absolute deviation: the average of |x − mean|. Not the
 * standard deviation, which is the average of (x − mean)² square-rooted. They are
 * different numbers, and substituting one for the other (a common bug, because
 * `stdev` is already sitting there) inflates CCI by roughly 25% and pushes it
 * across the ±100 lines that the entire indicator is read against.
 *
 * The 0.015 constant exists solely to make ~70-80% of readings fall inside ±100.
 * It is a scaling convention with no theory behind it, and it must be exactly
 * 0.015 or our CCI is not comparable to anyone else's.
 *
 * The mean deviation needs the window's mean before it can be computed, so this
 * is genuinely O(n·period) — one of the few here that is. At period 20 over 1,000
 * bars that is 20,000 operations, which is nothing.
 */
export const cciCalculator: IIndicator = {
  name: "cci",
  label: "CCI",
  defaults: { period: 20, source: "hlc3" },
  warmup: (p) => p.period ?? 20,

  compute: ({ candles, params }) => {
    const period = params.period ?? 20;
    const typical = extractSource(candles, params.source ?? "hlc3");
    const means = sma(typical, period);

    return means.map((mean, i) => {
      if (mean === null) return null;

      let deviation = 0;
      for (let j = i - period + 1; j <= i; j++) {
        deviation += Math.abs(typical[j] - mean);
      }
      deviation /= period;

      // A perfectly flat window has no deviation. CCI is undefined, not zero:
      // zero would read as "exactly at the mean, no momentum", which is true but
      // is also what a dead market reports, and they are not the same situation.
      if (deviation === 0) return null;

      return (typical[i] - mean) / (0.015 * deviation);
    });
  },
};

/* ── Williams %R ───────────────────────────────────────────────────── */

/**
 * Williams %R — the Stochastic, inverted, on a −100…0 scale.
 *
 * Formula:     −100 · (highest(high, n) − close) / (highest(high, n) − lowest(low, n))
 * Defaults:    period 14
 * Warmup:      `period` bars
 * Complexity:  O(n)
 * Edge cases:  a flat range returns −50 (the neutral midpoint), for the same
 *              reason raw %K returns 50 — a frozen market is undefined, not
 *              maximally anything.
 */
export const williamsRCalculator: IIndicator = {
  name: "williams_r",
  label: "Williams %R",
  defaults: { period: 14 },
  warmup: (p) => p.period ?? 14,

  compute: ({ candles, params }) => {
    const period = params.period ?? 14;
    const highs = highest(candles.map((c) => c.high), period);
    const lows = lowest(candles.map((c) => c.low), period);

    return candles.map((candle, i) => {
      const high = highs[i];
      const low = lows[i];
      if (high === null || low === null) return null;

      const range = high - low;
      if (range === 0) return -50;

      return (-100 * (high - candle.close)) / range;
    });
  },
};

/* ── ROC ───────────────────────────────────────────────────────────── */

/**
 * Rate of Change — percentage move over N bars.
 *
 * Formula:     100 · (source[i] − source[i−n]) / source[i−n]
 * Defaults:    period 9, source close
 * Warmup:      period + 1 bars
 * Complexity:  O(n)
 * Edge cases:  a zero price `n` bars ago would divide by zero — impossible in
 *              practice, because the market boundary rejects zero prices before
 *              they ever reach here (`priceSchema` refuses them). Guarded anyway:
 *              a NaN loose in a strategy makes every comparison silently false.
 */
export const rocCalculator: IIndicator = {
  name: "roc",
  label: "Rate of change",
  defaults: { period: 9, source: "close" },
  warmup: (p) => (p.period ?? 9) + 1,

  compute: ({ candles, params }) => {
    const period = params.period ?? 9;
    const source = extractSource(candles, params.source ?? "close");
    const out: Maybe[] = new Array(source.length).fill(null);

    for (let i = period; i < source.length; i++) {
      const then = source[i - period];
      if (then === 0) continue;
      out[i] = ((source[i] - then) / then) * 100;
    }

    return out;
  },
};

/* ── MFI ───────────────────────────────────────────────────────────── */

/**
 * Money Flow Index — "volume-weighted RSI".
 *
 * Formula:     raw flow  = typical · volume
 *              positive  = Σ(flow where typical rose) over n
 *              negative  = Σ(flow where typical fell) over n
 *              MFI       = 100 − 100/(1 + positive/negative)
 * Defaults:    period 14
 * Warmup:      period + 1 bars
 * Complexity:  O(n·period)
 *
 * ── SIMPLE sums, not Wilder ──
 *
 * Unlike RSI, MFI is defined on plain rolling SUMS of the flows, not on Wilder
 * averages. Applying Wilder here (the natural instinct, given how similar the
 * final formula looks) produces a curve that tracks the real MFI loosely and
 * agrees with nobody.
 *
 * Edge cases:  no negative flow in the window → MFI = 100. Correct: it means
 *              every bar in the window rose. A window where the typical price did
 *              not change at all contributes to neither side, and if the entire
 *              window is flat both sums are zero — undefined, so null.
 */
export const mfiCalculator: IIndicator = {
  name: "mfi",
  label: "Money flow index",
  defaults: { period: 14 },
  warmup: (p) => (p.period ?? 14) + 1,

  compute: ({ candles, params }) => {
    const period = params.period ?? 14;
    const typical = candles.map((c) => (c.high + c.low + c.close) / 3);
    const flow = candles.map((c, i) => typical[i] * c.volume);

    const out: Maybe[] = new Array(candles.length).fill(null);

    for (let i = period; i < candles.length; i++) {
      let positive = 0;
      let negative = 0;

      for (let j = i - period + 1; j <= i; j++) {
        if (typical[j] > typical[j - 1]) positive += flow[j];
        else if (typical[j] < typical[j - 1]) negative += flow[j];
        // An unchanged typical price is genuinely neither. It is not "sell".
      }

      if (positive === 0 && negative === 0) continue; // a frozen window
      if (negative === 0) {
        out[i] = 100;
        continue;
      }

      out[i] = 100 - 100 / (1 + positive / negative);
    }

    return out;
  },
};
