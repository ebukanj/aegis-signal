import type { Swing } from "../../domain/swing";

/**
 * Trendlines, fitted rather than drawn.
 *
 * This is the file that turns *"I can see a wedge if I squint"* into a number a
 * strategy can gate on. Every geometric pattern in the engine — flags, wedges,
 * triangles, channels — is two of these plus a rule about how they relate.
 *
 * ── Why R² is the honest part ──
 *
 * Any two points define a line. **Any** two. So a detector that draws a line
 * through two swing highs and calls it a trendline has proven nothing at all — it
 * has proven that two points exist. R² asks the question that matters: do the
 * points actually *lie* on this line, or did we just connect them?
 *
 * A wedge whose trendlines fit at R² = 0.92 is a wedge. One that fits at 0.31 is
 * two lines drawn through noise, and reporting it with `quality: 0.31` and letting
 * the strategy decide is not tolerance — it is passing junk downstream and hoping
 * someone else refuses it. The engine refuses it here.
 */

export interface Trendline {
  /** Price change per bar. Positive = rising. */
  slope: number;
  /** Price at bar index 0 of the candle array. */
  intercept: number;
  /**
   * 0–1. How well the swings actually lie on this line.
   *
   * 1.0 means every point is exactly on it. Below ~0.5, the "line" is a fiction.
   */
  rSquared: number;
  /** The swings it was fitted through. Its working, shown. */
  points: Swing[];
}

/**
 * Least-squares fit through swing points.
 *
 * Fitted through SWINGS, never through every candle. Fitting a line through all
 * closes produces a regression channel — a legitimate but *different* object,
 * which describes the average path of price rather than the boundary it kept
 * respecting. A trendline is a boundary: it is where price kept turning around,
 * and only the turning points carry that information.
 *
 * Needs at least 2 points, and is meaningless with fewer than 3 — with exactly 2,
 * R² is 1.0 by construction (a line through two points passes through both), which
 * is why `MINIMUM_POINTS_FOR_MEANINGFUL_FIT` exists and why the detectors demand
 * three touches.
 */
export function fitTrendline(points: readonly Swing[]): Trendline | null {
  if (points.length < 2) return null;

  const n = points.length;

  let sumX = 0;
  let sumY = 0;

  for (const point of points) {
    sumX += point.index;
    sumY += point.price;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  let covariance = 0;
  let varianceX = 0;

  for (const point of points) {
    const dx = point.index - meanX;
    covariance += dx * (point.price - meanY);
    varianceX += dx * dx;
  }

  // Every point on the same bar. Not a line — a vertical, which is not a trendline
  // and cannot be one.
  if (varianceX === 0) return null;

  const slope = covariance / varianceX;
  const intercept = meanY - slope * meanX;

  /*
   * R² = 1 − (residual sum of squares / total sum of squares).
   *
   * The zero-variance guard matters: if every swing is at the SAME PRICE (a
   * perfectly flat top — real, and common), the total sum of squares is 0 and R²
   * is 0/0. The honest answer there is R² = 1: the points lie exactly on a
   * horizontal line. Returning 0 would make the engine reject the cleanest flat
   * top it will ever see, which is precisely backwards.
   */
  let residual = 0;
  let total = 0;

  for (const point of points) {
    const predicted = slope * point.index + intercept;
    residual += (point.price - predicted) ** 2;
    total += (point.price - meanY) ** 2;
  }

  const rSquared = total === 0 ? 1 : Math.max(0, 1 - residual / total);

  return {
    slope,
    intercept,
    rSquared,
    points: points.slice(),
  };
}

/** The line's price at a given bar. */
export function priceAt(line: Trendline, index: number): number {
  return line.slope * index + line.intercept;
}

/**
 * Slope as a fraction of price per bar.
 *
 * A raw slope is in price-units-per-bar, so BTC's is in the hundreds and DOGE's is
 * in the millionths. Utterly incomparable, and a "is this line flat?" threshold
 * tuned on one is meaningless on the other. Normalising by the line's own price
 * level makes `0.001` mean "rising 0.1% per bar" on every instrument in the
 * universe — which is the only way a single detector can work across all of them.
 */
export function normalizedSlope(line: Trendline, atIndex: number): number {
  const price = priceAt(line, atIndex);
  if (price <= 0) return 0;

  return line.slope / price;
}

/** Is the line flat, within tolerance? The definition of a triangle's flat edge. */
export function isFlat(
  line: Trendline,
  atIndex: number,
  tolerance = FLAT_SLOPE_TOLERANCE,
): boolean {
  return Math.abs(normalizedSlope(line, atIndex)) <= tolerance;
}

/**
 * Do two lines converge, diverge, or run parallel?
 *
 * The one question that separates the whole geometric family:
 *
 *   · converging + both falling  → falling wedge
 *   · converging + both rising   → rising wedge
 *   · converging + flat top      → descending triangle
 *   · converging + flat bottom   → ascending triangle
 *   · converging, opposite slopes→ symmetrical triangle
 *   · parallel   + rising        → ascending channel
 *   · parallel   + falling       → descending channel
 *
 * Measured as the change in the GAP between them, normalised by price. Comparing
 * raw slopes would call two lines "parallel" when they are 0.5% apart per bar,
 * which on a 40-bar pattern closes a gap of 20% — a violent convergence that looks
 * parallel to a naive comparison.
 */
export function convergence(
  upper: Trendline,
  lower: Trendline,
  fromIndex: number,
  toIndex: number,
): {
  kind: "CONVERGING" | "DIVERGING" | "PARALLEL";
  /** How much of the starting gap has closed by `toIndex`. 1 = they meet. */
  ratio: number;
} {
  const startGap = priceAt(upper, fromIndex) - priceAt(lower, fromIndex);
  const endGap = priceAt(upper, toIndex) - priceAt(lower, toIndex);

  // The lines have already crossed. Not a pattern — a mess, and the detector must
  // not try to name it.
  if (startGap <= 0) return { kind: "DIVERGING", ratio: 0 };

  const ratio = 1 - endGap / startGap;

  if (ratio > CONVERGENCE_THRESHOLD) return { kind: "CONVERGING", ratio };
  if (ratio < -CONVERGENCE_THRESHOLD) return { kind: "DIVERGING", ratio };

  return { kind: "PARALLEL", ratio };
}

/**
 * How parallel are two lines, 0–1?
 *
 * The quality measure for a channel. A channel whose lines drift apart is not a
 * channel — it is a broadening formation, and those are refused (ADR-024) because
 * almost any choppy stretch of chart can be fitted to one.
 */
export function parallelism(
  upper: Trendline,
  lower: Trendline,
  fromIndex: number,
  toIndex: number,
): number {
  const { ratio } = convergence(upper, lower, fromIndex, toIndex);

  // A perfectly parallel channel has ratio 0. Anything approaching a 40% change in
  // the gap is not parallel in any useful sense.
  return Math.max(0, 1 - Math.abs(ratio) / 0.4);
}

/**
 * A line is only a line if price actually RESPECTED it.
 *
 * Counts how many times price came to the line and turned away, versus how many
 * times it simply walked through. A "resistance trendline" that price has closed
 * above four times is not resistance — it is a line on a chart, and the fact that
 * three swing highs happen to sit on it is a coincidence the detector must not
 * dignify.
 *
 * This is the check that kills most false positives, and it is the one that naive
 * pattern detectors leave out.
 */
export function respects(
  line: Trendline,
  candles: readonly { high: number; low: number; close: number }[],
  fromIndex: number,
  toIndex: number,
  side: "ABOVE" | "BELOW",
  tolerance = RESPECT_TOLERANCE,
): { violations: number; touches: number } {
  let violations = 0;
  let touches = 0;

  for (let i = fromIndex; i <= toIndex && i < candles.length; i++) {
    if (i < 0) continue;

    const level = priceAt(line, i);
    if (level <= 0) continue;

    const candle = candles[i];

    if (side === "ABOVE") {
      // The line is a CEILING. A close above it is a violation; a wick that reaches
      // it and pulls back is a touch — which is the line doing its job.
      if (candle.close > level * (1 + tolerance)) violations++;
      else if (candle.high >= level * (1 - tolerance)) touches++;
    } else {
      if (candle.close < level * (1 - tolerance)) violations++;
      else if (candle.low <= level * (1 + tolerance)) touches++;
    }
  }

  return { violations, touches };
}

/** Below three points, R² is not evidence — a line through 2 points fits perfectly. */
export const MINIMUM_POINTS_FOR_MEANINGFUL_FIT = 3;

/** Slope within ±0.05% per bar counts as flat. */
export const FLAT_SLOPE_TOLERANCE = 0.0005;

/** The gap must change by more than 15% for the lines to be converging at all. */
export const CONVERGENCE_THRESHOLD = 0.15;

/** Price within 0.2% of a line is "at" it. */
export const RESPECT_TOLERANCE = 0.002;
