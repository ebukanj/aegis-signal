import type {
  Candle,
  DetectedPattern,
  Pattern,
  Timeframe,
} from "@aegis/contracts";
import type { Swing } from "./swing";

/**
 * What every pattern detector is.
 *
 * The Indicator Engine answers *"what is happening mathematically?"* — RSI is
 * 28.3, ATR is 359. This engine answers a different question: *"what structure is
 * the market forming?"* Those are not the same, and a moving average cannot
 * express the second one.
 *
 * ── The rules, and why each exists ──
 *
 * · **Deterministic.** Same candles in, same patterns out, forever. Confidence is
 *   calibrated by replaying history (ADR-024), and you cannot calibrate against a
 *   detector that finds a flag on Tuesday and not on Wednesday.
 *
 * · **Objective.** No detector may rely on interpretation. This is why head &
 *   shoulders is not here: ten traders draw the neckline ten different ways, so a
 *   "deterministic" H&S detector would be picking one arbitrary reading and
 *   stamping a quality score on it. That is manufacturing certainty.
 *
 * · **Explainable.** Every detection carries `evidence` and `weaknesses` in plain
 *   English. A detector that returns `BULL_FLAG: true, quality: 0.87` is demanding
 *   trust. One that says *"the pole ran 6.2% in 4 bars, the pullback retraced 38%
 *   on falling volume, trendlines fit at R²=0.91 — but volume did not confirm the
 *   break"* is showing its working, and a human can disagree with it.
 *
 * · **It never decides.** A pattern is evidence, not a trade. Nothing in this
 *   module knows what a signal is, and nothing in it may ever say a setup is good.
 */

/** Everything a detector is allowed to see. Note what is absent: everything else. */
export interface DetectionContext {
  /**
   * CLOSED candles only, oldest → newest, gapless. The validator guarantees it.
   *
   * A forming bar in here is look-ahead bias: its high can still rise, so a
   * "completed" flag might yet not be one.
   */
  readonly candles: readonly Candle[];

  /**
   * The confirmed swings, computed ONCE and shared.
   *
   * Every detector needs them and none may compute its own — partly for speed
   * (swing detection is the expensive part and re-running it per detector would be
   * ~15× the work), but mostly because two detectors that disagree about where a
   * swing is will disagree about everything, silently.
   */
  readonly swings: readonly Swing[];

  readonly timeframe: Timeframe;

  /** Volume relative to its own recent average, per bar. Null where undefined. */
  readonly relativeVolume: readonly (number | null)[];
}

/**
 * One detector.
 *
 * Returns **every** occurrence it finds, not just the latest. A strategy asking
 * "was there a liquidity sweep?" needs to know if it happened three bars ago, and
 * the Confluence layer will later want to know whether two patterns overlap in
 * time.
 *
 * Returning an empty array is the normal case and is not a failure. **Most bars,
 * on most instruments, contain no pattern at all** — a detector that finds
 * something every time it is asked is a detector that has started hallucinating,
 * and the false-positive suite exists to catch exactly that.
 */
export interface IPatternDetector {
  /** The name in the contract's vocabulary. The registry keys on this. */
  readonly pattern: Pattern;

  /** Human-readable, for errors and for the strategy editor. */
  readonly label: string;

  /**
   * The fewest candles that could possibly contain this pattern.
   *
   * The validator refuses to run a detector with less. A "double top" found in six
   * bars is not a double top; it is two adjacent wiggles, and reporting it is how
   * a detector's precision quietly collapses.
   */
  readonly minimumCandles: number;

  /** The fewest confirmed swings the geometry needs. */
  readonly minimumSwings: number;

  detect(context: DetectionContext): DetectedPattern[];
}

/**
 * The minimum quality below which a geometric detection is not reported at all.
 *
 * A wedge whose trendlines fit at R² = 0.3 is not a low-quality wedge. It is not a
 * wedge — it is two lines drawn through noise, and any two points can be joined by
 * a line. Returning it with `quality: 0.3` and letting the strategy filter it out
 * sounds tolerant and is not: it floods the Confluence layer with junk, and
 * "several low-quality patterns agree" is precisely the false confidence this
 * platform exists to refuse.
 *
 * Objective patterns are exempt — they happened or they did not.
 */
export const MINIMUM_REPORTABLE_QUALITY = 0.5;
