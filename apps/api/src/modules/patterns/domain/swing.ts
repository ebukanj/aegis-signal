import type { SwingPoint } from "@aegis/contracts";

/**
 * A swing, enriched.
 *
 * The contract's `SwingPoint` is what leaves the platform: time, price, kind,
 * strength. This is what the detectors work with internally — the same point, plus
 * the things geometry needs and a wire format has no business carrying.
 */
export interface Swing extends SwingPoint {
  /** Index into the candle array. Geometry needs positions, not timestamps. */
  index: number;

  /**
   * Bars since it formed.
   *
   * A break of structure against a swing from 200 bars ago is a different event
   * from one against a swing from 8 bars ago — the first breaks a level the market
   * has respected for a long time, the second breaks last week's noise. Nothing
   * downstream can tell them apart without this.
   */
  age: number;

  /**
   * How far this swing stands out from the bars around it, as a fraction of price.
   *
   * **The difference between a swing and a wiggle**, and the single most important
   * field here after `price`. A pivot 0.05% above its neighbours technically
   * satisfies the pivot rule and is a rounding error that happened to have lower
   * bars on both sides. One that is 3% above them is a swing any trader would mark
   * on a chart without being asked.
   *
   * Every quality score in this module leans on this, because it is what stops the
   * detectors from finding textbook geometry in noise.
   */
  prominence: number;
}

/** How swings relate to one another — the raw material of market structure. */
export interface SwingSequence {
  highs: Swing[];
  lows: Swing[];
  /** All of them, in time order. */
  all: Swing[];
}

/**
 * A cluster of swings at the same price.
 *
 * Three highs within 0.2% of each other is not three separate rejections that
 * happen to be near each other — it is ONE level being defended three times, and
 * the distinction is the whole point of clustering. Without it, a support/
 * resistance engine reports three weak levels where there is one strong one, and a
 * "triple top" detector cannot tell a triple top from three unrelated highs.
 */
export interface SwingCluster {
  kind: "HIGH" | "LOW";
  /** The band the members span. A level is never a line. */
  low: number;
  high: number;
  /** Volume-agnostic centre: the mean of the members. */
  center: number;
  members: Swing[];
  /** The most recent member's bar index. */
  lastIndex: number;
}
