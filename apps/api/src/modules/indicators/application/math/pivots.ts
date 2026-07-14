import type { Candle } from "@aegis/contracts";

/**
 * THE ONE PIVOT ALGORITHM.
 *
 * Every swing, every structure break, every wedge, every flag, every divergence
 * rests on this. If two parts of the platform disagree about where a swing high
 * is, they disagree about everything built on top of it — and they will disagree
 * *quietly*, because both answers look perfectly reasonable in isolation.
 *
 * The Divergence Engine had its own copy of this. Two implementations of the same
 * idea do not stay the same; one gets a fix the other does not, and six months
 * later the Structure Engine says the trend is intact while the Divergence Engine
 * is comparing swings the Structure Engine has never heard of. So there is one,
 * and it lives here — in the indicator module's math layer, which patterns may
 * depend on (dependencies point inward) and which depends on nothing.
 *
 * ── CONFIRMATION, and what it costs ──
 *
 * A pivot low at bar `i` is only a pivot once `strength` bars *after* it have
 * failed to go lower. Until then it is merely the lowest bar so far, and the next
 * bar might break it.
 *
 * This means **the most recent confirmable pivot is always `strength` bars in the
 * past**, and there is no way around that which is not a lie. A detector that
 * reports a pivot at the current bar is reporting one it cannot yet know exists.
 * It will backtest brilliantly — because in a backtest the next five bars are
 * already sitting there — and it will fail live, which is the signature of
 * look-ahead bias and the reason this platform refuses it everywhere.
 *
 * The lag is not a deficiency. It is the price of the pivot being real.
 */

export interface Pivot {
  /** Index into the candle array. */
  index: number;
  time: number;
  price: number;
  kind: "HIGH" | "LOW";
  /** Bars on each side that this point exceeds. Higher = more significant. */
  strength: number;
}

/**
 * Find every confirmed pivot in the series.
 *
 * `strength` is bars on EACH side. A pivot high at strength 5 is a bar whose high
 * exceeds the highs of the five bars before it and the five bars after it.
 *
 * O(n · strength). For the values that matter (strength 3–10 over ~500 candles)
 * that is a few thousand comparisons — and a smarter algorithm here would be
 * optimising the wrong thing while making the most correctness-critical code in
 * the module harder to read.
 */
export function findPivots(
  candles: readonly Candle[],
  strength: number,
): Pivot[] {
  if (strength < 1) {
    throw new Error(
      "A pivot needs at least one bar on each side to be a pivot at all",
    );
  }

  const pivots: Pivot[] = [];

  /*
   * The bounds ARE the look-ahead guard.
   *
   * We start at `strength` (there must be bars before) and stop at
   * `length - strength` (there must be bars after, and they must already exist).
   * The final `strength` bars are deliberately unreachable — they are the
   * unconfirmed tail, and reaching into them is exactly the bug.
   */
  const end = candles.length - strength;

  for (let i = strength; i < end; i++) {
    const candle = candles[i];

    let isHigh = true;
    let isLow = true;

    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;

      /*
       * STRICT on the left, NON-STRICT on the right. This asymmetry is deliberate
       * and it is not cosmetic.
       *
       * A run of identical highs — a flat top, which is common and meaningful —
       * would otherwise produce either NO pivot (if both sides are strict) or
       * SEVERAL pivots at the same price (if both are loose). The first loses a
       * real structural level; the second reports a double top that is actually
       * one flat bar repeated, and the false positives cascade into every
       * detector above.
       *
       * With this rule, a plateau produces exactly ONE pivot: the first bar of it.
       */
      if (j < i) {
        if (candles[j].high >= candle.high) isHigh = false;
        if (candles[j].low <= candle.low) isLow = false;
      } else {
        if (candles[j].high > candle.high) isHigh = false;
        if (candles[j].low < candle.low) isLow = false;
      }

      if (!isHigh && !isLow) break;
    }

    // A single bar can be both, on a one-bar spike that is the local high AND the
    // local low of its neighbourhood. Rare, real, and both are recorded.
    if (isHigh) {
      pivots.push({
        index: i,
        time: candle.time,
        price: candle.high,
        kind: "HIGH",
        strength,
      });
    }

    if (isLow) {
      pivots.push({
        index: i,
        time: candle.time,
        price: candle.low,
        kind: "LOW",
        strength,
      });
    }
  }

  // Chronological. Every consumer walks these in time order, and a detector that
  // received them grouped by kind would silently compare a high to a low.
  return pivots.sort((a, b) => a.index - b.index);
}

/** The last index a pivot could possibly be confirmed at. */
export function lastConfirmableIndex(
  candleCount: number,
  strength: number,
): number {
  return candleCount - strength - 1;
}
