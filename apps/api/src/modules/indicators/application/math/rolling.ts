/**
 * The primitives every indicator is built from.
 *
 * Pure, allocation-light, and **O(n)** wherever a naive implementation would be
 * O(n·period). That is not premature optimisation: the scanner evaluates ~19
 * symbols × 4 timeframes × a dozen indicators on every closed bar, and an O(n·p)
 * SMA(200) over 1,000 candles is 200,000 additions to produce a number that
 * needed 1,000.
 *
 * ── Numerical precision ──
 *
 * Everything is float64, and **nothing is rounded in the middle of a
 * calculation**. Rounding intermediates feels tidy and is how you get an RSI that
 * disagrees with TradingView in the third decimal for reasons nobody can trace.
 * Rounding happens once, at the boundary, in `normalizeSeries` — see
 * `precision.ts`.
 *
 * The one place float64 needs help is the rolling sum below, which is why it uses
 * Kahan compensation.
 */

/** A value that could not be computed. Never 0. See `indicator.interface.ts`. */
export type Maybe = number | null;

/**
 * Simple moving average, O(n).
 *
 * ── Why Kahan summation ──
 *
 * The obvious rolling SMA keeps a running sum and does `sum += next - oldest`.
 * Over thousands of bars of float64 addition and subtraction, the error in that
 * sum ACCUMULATES and never washes out — it is not a rounding wobble, it is a
 * one-way drift. On a long BTC series the naive version and the honest version
 * part company in the sixth decimal, which is invisible until it is the thing
 * standing between `crosses_above` firing and not firing.
 *
 * Kahan tracks the low-order bits that each addition threw away and feeds them
 * back in. It costs three extra flops per bar and buys a sum that is correct.
 */
export function sma(values: readonly Maybe[], period: number): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);

  let sum = 0;
  let compensation = 0; // the bits the last addition lost
  let count = 0;

  const add = (x: number): void => {
    const y = x - compensation;
    const t = sum + y;
    compensation = t - sum - y;
    sum = t;
  };

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    /*
     * A null inside the window poisons it, and it must.
     *
     * An SMA(20) of "19 numbers and one unknown" is not an SMA(20). Treating the
     * null as a zero would drag the average toward zero; skipping it would make it
     * an SMA(19) wearing an SMA(20)'s name. Both are lies a strategy would trade
     * on, so the window resets and reports null until it is genuinely full again.
     */
    if (value === null) {
      sum = 0;
      compensation = 0;
      count = 0;
      continue;
    }

    add(value);
    count++;

    if (count > period) {
      const dropped = values[i - period];
      if (dropped !== null) add(-dropped);
      count = period;
    }

    if (count === period) out[i] = sum / period;
  }

  return out;
}

/**
 * Exponential moving average.
 *
 * α = 2/(period+1), seeded with the SMA of the first `period` values — the
 * convention TradingView and TA-Lib both use. Seeding with the first value
 * instead (which several libraries do) produces a visibly different curve for the
 * first few hundred bars, and "visibly different" is the difference between a
 * cross firing and not.
 *
 * **Recursive: it never fully forgets its seed.** An EMA(200) from exactly 200
 * bars is not the same number as one from 2,000 bars. `stability()` on the
 * calculator is the honest statement of that.
 */
export function ema(values: readonly Maybe[], period: number): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);
  const alpha = 2 / (period + 1);

  let previous: number | null = null;
  let seedSum = 0;
  let seedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (value === null) {
      // Restart cleanly rather than carry a value across a hole in the data.
      previous = null;
      seedSum = 0;
      seedCount = 0;
      continue;
    }

    if (previous === null) {
      seedSum += value;
      seedCount++;

      if (seedCount === period) {
        previous = seedSum / period;
        out[i] = previous;
      }
      continue;
    }

    previous = value * alpha + previous * (1 - alpha);
    out[i] = previous;
  }

  return out;
}

/**
 * Wilder's smoothing — the "other" EMA, and the source of endless disagreement.
 *
 * Wilder (who invented RSI, ATR and ADX) used α = 1/period, not 2/(period+1).
 * They are not the same, and an RSI(14) computed with the wrong one is wrong by
 * several points — enough to sit on the correct side of a 30/70 threshold when
 * the truth sits on the other.
 *
 * Every Wilder indicator in this module routes through here so the mistake can
 * only be made once, and it was not made.
 */
export function wilder(values: readonly Maybe[], period: number): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);

  let previous: number | null = null;
  let seedSum = 0;
  let seedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (value === null) {
      previous = null;
      seedSum = 0;
      seedCount = 0;
      continue;
    }

    if (previous === null) {
      seedSum += value;
      seedCount++;

      if (seedCount === period) {
        previous = seedSum / period;
        out[i] = previous;
      }
      continue;
    }

    previous = (previous * (period - 1) + value) / period;
    out[i] = previous;
  }

  return out;
}

/**
 * Rolling POPULATION standard deviation, O(n) via Welford.
 *
 * Population (÷n), not sample (÷n−1). Bollinger Bands are defined on the
 * population deviation, and using the sample one widens every band slightly —
 * which quietly loosens every "price outside the band" condition in the platform.
 *
 * Welford rather than √(E[x²] − E[x]²): the latter is one subtraction of two
 * large nearly-equal numbers, and on price series (where the mean dwarfs the
 * variance — think BTC at 62,000 with a 40-point deviation) it catastrophically
 * cancels and can even return a negative variance.
 */
export function stdev(values: readonly Maybe[], period: number): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    let m2 = 0;
    let count = 0;
    let usable = true;

    for (let j = i - period + 1; j <= i; j++) {
      const value = values[j];
      if (value === null) {
        usable = false;
        break;
      }

      count++;
      const delta = value - mean;
      mean += delta / count;
      m2 += delta * (value - mean);
    }

    if (usable && count === period) {
      out[i] = Math.sqrt(m2 / period);
    }
  }

  return out;
}

/** Rolling maximum over `period` bars, O(n) via a monotonic deque. */
export function highest(values: readonly Maybe[], period: number): Maybe[] {
  return rollingExtreme(values, period, (a, b) => a >= b);
}

/** Rolling minimum over `period` bars, O(n) via a monotonic deque. */
export function lowest(values: readonly Maybe[], period: number): Maybe[] {
  return rollingExtreme(values, period, (a, b) => a <= b);
}

/**
 * The deque trick: keep candidate indices in monotonic order, so the extreme of
 * the window is always at the front. Each index is pushed and popped at most
 * once, which is what makes a rolling max O(n) rather than O(n·period).
 */
function rollingExtreme(
  values: readonly Maybe[],
  period: number,
  dominates: (candidate: number, incumbent: number) => boolean,
): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);
  const deque: number[] = []; // indices, monotonic by value

  /** The most recent index holding a null. The window must sit entirely after it. */
  let lastNull = -1;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (value === null) {
      lastNull = i;
      deque.length = 0;
      continue;
    }

    // Anything the newcomer dominates can never be the answer again.
    while (deque.length > 0) {
      const back = values[deque[deque.length - 1]];
      if (back !== null && dominates(value, back)) deque.pop();
      else break;
    }
    deque.push(i);

    // Drop what has fallen out of the window.
    while (deque.length > 0 && deque[0] <= i - period) deque.shift();

    // The window is [windowStart, i]. It means something only if it is both full
    // and free of nulls — a "highest high over 20 bars" computed from 14 of them
    // is not a highest high over 20 bars.
    const windowStart = i - period + 1;
    if (windowStart >= 0 && windowStart > lastNull) {
      out[i] = values[deque[0]];
    }
  }

  return out;
}

/** Cumulative sum, resetting on null. Used by OBV and CVD. */
export function cumulative(values: readonly Maybe[]): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);

  let total: number | null = null;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null) {
      out[i] = null;
      continue;
    }

    total = (total ?? 0) + value;
    out[i] = total;
  }

  return out;
}

/** Change over `lag` bars. The basis of ROC and of every momentum measure. */
export function change(values: readonly Maybe[], lag = 1): Maybe[] {
  const out: Maybe[] = new Array(values.length).fill(null);

  for (let i = lag; i < values.length; i++) {
    const now = values[i];
    const then = values[i - lag];
    if (now === null || then === null) continue;
    out[i] = now - then;
  }

  return out;
}
