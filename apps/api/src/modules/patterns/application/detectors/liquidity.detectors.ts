import type { Candle, DetectedPattern } from "@aegis/contracts";
import type { IPatternDetector } from "../../domain/pattern.interface";
import { MINIMUM_REPORTABLE_QUALITY } from "../../domain/pattern.interface";
import type { Swing } from "../../domain/swing";
import { QualityEngine } from "../services/quality.engine";
import { MINIMUM_PROMINENCE } from "../services/swing.engine";

const quality = new QualityEngine();

/**
 * LIQUIDITY_SWEEP — the stop hunt, the false breakout, and the reclaim.
 *
 * The spec asks for these as four separate patterns. **They are one event**, and
 * splitting them would mean four detectors firing on the same bar, four entries in
 * the Confluence layer, and a confidence score that counted the same evidence four
 * times. That is not thoroughness; it is double-counting with extra steps.
 *
 * ── The event ──
 *
 *   1. Price WICKS beyond a swing level — through the pool of stops resting there.
 *   2. Those stops fill. That is the liquidity.
 *   3. Price CLOSES back on the original side, inside the range.
 *
 * That is a stop hunt. It is also a false breakout, and step 3 is the reclaim. One
 * shape, three names, depending on who is telling the story.
 *
 * ── Why this is the highest-value reversal pattern in the vocabulary ──
 *
 * It is the mechanical fingerprint of a large participant filling an order. They
 * cannot buy size at the lows without moving price, so price is pushed DOWN through
 * the obvious stops, the stopped-out longs sell into their bid, they get filled, and
 * price snaps back. Everyone who "correctly" identified the support level is now
 * flat, at the bottom.
 *
 * Detection:  low < swing low  AND  close > swing low, on the same bar.
 * Rule:       the CLOSE must reclaim. A bar that wicks below and closes below has
 *             not swept anything — it has simply broken the level, and the
 *             Structure Engine correctly reports that as a break instead. The two
 *             detectors are exact complements and cannot both fire.
 * Quality:    scored on how deep the wick went, how decisively it reclaimed, and
 *             whether volume showed up.
 * Failure:    a shallow wick one tick below a level on no volume is noise, not a
 *             sweep. The depth and volume factors are what separate them.
 *
 * ── A level must be OLD ENOUGH to be swept, and that is not a limitation ──
 *
 * A pivot is confirmed by the bars on either side of it. So a bar that wicks below
 * a low while still inside that low's right-hand confirmation window destroys the
 * pivot outright — a lower low now exists within its own window — and the engine
 * reports no sweep.
 *
 * That is correct, and it took a failing test to see why. **A level that formed
 * three bars ago has no stops resting under it**, because nobody has had time to
 * place any. There is no liquidity to sweep. The lag is the same one every
 * confirmed swing carries, and it is the price of the level being real rather than
 * a shape we noticed on the way past.
 *
 * Complexity: O(bars × swings) over the recent window.
 */
export const liquiditySweepDetector: IPatternDetector = {
  pattern: "LIQUIDITY_SWEEP",
  label: "Liquidity sweep",
  minimumCandles: 25,
  minimumSwings: 2,

  detect(context) {
    const { candles, swings } = context;
    const results: DetectedPattern[] = [];

    /*
     * ── The depth floor must scale with VOLATILITY, not be a fixed percentage ──
     *
     * This was an absolute 0.1%, and the false-positive suite caught it: the
     * detector fired in 88% of pure random walks.
     *
     * The reason is obvious in hindsight. "How far past the level is meaningful?"
     * has no absolute answer. A 0.1% wick beyond a swing is a decisive stop-run on
     * BTC, where bars average 0.3% — and it is *less than the width of a single
     * bar* on a memecoin that routinely moves 5% an hour. A fixed floor therefore
     * means "decisive" on one instrument and "noise" on the next, and the platform
     * trades both.
     *
     * Measured against the instrument's own average bar range, a sweep must now
     * penetrate at least 25% of a typical bar to count as a sweep rather than a
     * touch. That is a statement that means the same thing everywhere.
     */
    const averageRange = meanRange(candles);
    if (averageRange <= 0) return [];

    const minimumDepth = Math.max(
      MINIMUM_SWEEP_DEPTH_FLOOR,
      averageRange * SWEEP_DEPTH_IN_BARS,
    );

    /*
     * ── A SWEEP MUST SWEEP A **POOL**, and this is the whole fix ──
     *
     * The false-positive suite kept reporting this detector at 83% of random walks,
     * and no amount of threshold-tuning moved it. Tuning was the wrong instrument:
     * the DEFINITION was too weak.
     *
     * "Any bar that wicked past any prior swing and closed back" is a true
     * statement about the data and it is not the event traders mean. In any market
     * — random or real — with fifty swings behind you, something pokes through
     * something almost every day.
     *
     * The word doing the work is **liquidity**. Stops do not rest under every
     * squiggle; they pile up under levels people can SEE and have ALREADY TRADED
     * OFF. A level that has been visited once has no pool beneath it, because
     * nobody has had a reason to place an order there yet. A level visited twice at
     * the same price does — and that is exactly the `LIQUIDITY_POOL` the Zone
     * Engine reports.
     *
     * So a sweep must take out a level that price has tested at least twice. That
     * is not a tightening of a threshold. It is the detector finally detecting the
     * thing it is named after.
     */
    const pooled = poolLevels(swings);

    // Only recent bars. A sweep from 80 bars ago is history, not a setup.
    const start = Math.max(1, candles.length - SWEEP_WINDOW);

    for (let i = start; i < candles.length; i++) {
      const candle = candles[i];

      for (const swing of swings) {
        // The swing must PREDATE the bar that swept it. A swing cannot be swept by
        // a candle that came before it — and a detector that does not check this
        // will happily "find" one, because the arrays are just numbers.
        if (swing.index >= i) continue;
        if (i - swing.index > SWEEP_MAX_AGE) continue;

        /*
         * THE SWEPT SWING MUST BE A SWING SOMEBODY WAS WATCHING.
         *
         * `MINIMUM_PROMINENCE` was declared in the swing engine and enforced
         * NOWHERE — dead code that read like a safety net. The false-positive suite
         * is what surfaced it.
         *
         * A "liquidity sweep" of a pivot that sits 0.1% above its neighbours is not
         * a stop hunt, because there are no stops there: nobody drew that level,
         * nobody traded off it, and nobody placed an order beyond it. The pattern is
         * about STOPS BEING TAKEN, and stops only rest under levels people can see.
         *
         * This is the difference between the event traders mean and a bar that
         * happened to poke through a squiggle.
         */
        if (swing.prominence < MINIMUM_PROMINENCE) continue;

        // There is no liquidity under a level nobody has traded off. See above.
        if (!pooled.has(swing)) continue;

        const swept = detectSweep(candle, swing);
        if (!swept) continue;

        const depth = swept.depth;

        // A wick one tick past the level is not a sweep, it is a touch.
        if (depth < minimumDepth) continue;

        const volume = quality.volumeExpansion(context.relativeVolume, i);

        const factors = [
          {
            name: "sweep depth",
            value: clamp01(depth / (minimumDepth * 4)),
            evidence: `price wicked ${(depth * 100).toFixed(2)}% beyond the swing ${swing.kind === "LOW" ? "low" : "high"} at ${fmt(swing.price)} — taking the stops resting there`,
            weakness: `the wick only went ${(depth * 100).toFixed(2)}% beyond the level — barely a sweep`,
          },
          {
            name: "reclaim",
            value: clamp01(swept.reclaim / (depth * 2 + 1e-12)),
            evidence: `and CLOSED back ${swept.direction === "LONG" ? "above" : "below"} it — the level was reclaimed, not broken`,
            weakness: "the reclaim was marginal — price barely got back inside",
          },
          quality.swingProminence([swing]),
          volume,
        ];

        const verdict = quality.score(factors);

        /*
         * THE QUALITY FLOOR — which this detector was missing, and the geometry
         * family already had.
         *
         * The false-positive suite found it: even with a volatility-scaled depth
         * floor, the detector fired in 83% of random walks. The reason is that it
         * examines every (recent bar × prior swing) pair — a thousand chances for
         * SOMETHING to have wicked past SOMETHING and closed back. Most of those are
         * shallow pokes at meaningless swings, and the quality score already knew:
         * it was scoring them at 0.2. The detector was simply reporting them anyway.
         *
         * A sweep of a swing nobody was watching, on no volume, that barely
         * reclaimed, is not a sweep. It is a bar.
         */
        if (verdict.quality < MINIMUM_REPORTABLE_QUALITY) continue;

        results.push({
          pattern: "LIQUIDITY_SWEEP",
          timeframe: context.timeframe,
          // A sweep of the LOWS is a bullish event: the stops below were taken and
          // price rejected. The direction is the direction of the expected move,
          // not the direction of the wick.
          direction: swept.direction,
          quality: verdict.quality,
          strength: clamp01(depth / 0.02),
          detectedAt: candle.time,
          startedAt: swing.time,
          swings: [toSwingPoint(swing)],
          triggerPrice: candle.close,
          // If price goes back through the sweep's extreme, the sweep failed and
          // the level really is breaking.
          invalidationPrice: swept.direction === "LONG" ? candle.low : candle.high,
          confirmed: true,
          breakoutPending: false,
          volumeConfirmed: volume.confirmed,
          evidence: verdict.evidence,
          weaknesses: verdict.weaknesses,
        });
      }
    }

    return results;
  },
};

/**
 * The swings that actually have stops resting beyond them.
 *
 * A swing qualifies when at least one OTHER swing of the same kind sits within
 * `EQUAL_TOLERANCE` of it — i.e. price has been rejected from (or has held) that
 * same level more than once. That is what makes it a level rather than a wiggle,
 * and it is what makes the stops pile up.
 */
function poolLevels(swings: readonly Swing[]): Set<Swing> {
  const pooled = new Set<Swing>();

  for (const a of swings) {
    for (const b of swings) {
      if (a === b || a.kind !== b.kind) continue;

      const apart = Math.abs(a.price - b.price) / Math.max(a.price, b.price);

      if (apart <= EQUAL_TOLERANCE) {
        pooled.add(a);
        break;
      }
    }
  }

  return pooled;
}

/** The average bar range, as a fraction of price. The instrument's own scale. */
function meanRange(candles: readonly Candle[]): number {
  if (candles.length === 0) return 0;

  const sum = candles.reduce(
    (acc, c) => acc + (c.high - c.low) / Math.max(c.close, 1e-9),
    0,
  );

  return sum / candles.length;
}

/** Did this bar wick through the swing and close back inside? */
function detectSweep(
  candle: Candle,
  swing: Swing,
): { depth: number; reclaim: number; direction: "LONG" | "SHORT" } | null {
  if (swing.kind === "LOW") {
    const wickedBelow = candle.low < swing.price;
    const closedBack = candle.close > swing.price;

    if (!wickedBelow || !closedBack) return null;

    return {
      depth: (swing.price - candle.low) / swing.price,
      reclaim: (candle.close - swing.price) / swing.price,
      direction: "LONG",
    };
  }

  const wickedAbove = candle.high > swing.price;
  const closedBack = candle.close < swing.price;

  if (!wickedAbove || !closedBack) return null;

  return {
    depth: (candle.high - swing.price) / swing.price,
    reclaim: (swing.price - candle.close) / swing.price,
    direction: "SHORT",
  };
}

/* ── Fair value gap ────────────────────────────────────────────────── */

/**
 * FAIR_VALUE_GAP — an imbalance price tends to revisit.
 *
 * Detection:  a three-bar formation where bar 1's high is BELOW bar 3's low (a
 *             bullish gap), or bar 1's low is ABOVE bar 3's high (bearish). The
 *             middle bar ran so hard that there is a band of price at which no
 *             trading actually happened.
 * Geometry:   the gap is the band between bar 1's extreme and bar 3's extreme.
 * Quality:    1 (objective). The gap exists or it does not — this is arithmetic on
 *             three numbers, with nothing to interpret.
 *
 * ── Why price comes back ──
 *
 * The band was skipped: buyers who wanted in at those prices never got filled,
 * because the market ran through in one bar. Their orders are still there. It is
 * one of the few "smart money" concepts with a mechanical explanation rather than a
 * mystical one, which is why it is in the vocabulary and head & shoulders is not.
 *
 * Fill status: reported. A gap that has already been filled is history; an UNFILLED
 *              one is a live magnet, and the difference is the whole point.
 * Failure:     tiny gaps are noise. A 0.05% imbalance is not a level anyone is
 *              waiting at, and the size floor is what stops this reporting dozens
 *              of them per chart.
 * Complexity:  O(n).
 */
export const fairValueGapDetector: IPatternDetector = {
  pattern: "FAIR_VALUE_GAP",
  label: "Fair value gap",
  minimumCandles: 10,
  minimumSwings: 0,

  detect(context) {
    const { candles } = context;
    const results: DetectedPattern[] = [];

    /*
     * The size floor scales with the instrument's own volatility, for the same
     * reason the sweep depth does: a 0.15% imbalance is a real, tradeable gap on
     * BTC and is *narrower than a single bar* on something that moves 5% an hour.
     *
     * A gap must span at least a third of a typical bar's range before anyone would
     * be waiting in it. Below that it is not an imbalance, it is the ordinary gap
     * between two candles that happened not to overlap.
     */
    const averageRange = meanRange(candles);
    if (averageRange <= 0) return [];

    const minimumSize = Math.max(
      MINIMUM_GAP_SIZE_FLOOR,
      averageRange * GAP_SIZE_IN_BARS,
    );

    const start = Math.max(2, candles.length - FVG_WINDOW);

    for (let i = start; i < candles.length; i++) {
      const first = candles[i - 2];
      const third = candles[i];

      const bullish = first.high < third.low;
      const bearish = first.low > third.high;

      if (!bullish && !bearish) continue;

      const low = bullish ? first.high : third.high;
      const high = bullish ? third.low : first.low;

      const size = (high - low) / Math.max(third.close, 1e-9);
      if (size < minimumSize) continue;

      /*
       * FILL STATUS — has price already come back into it?
       *
       * A filled gap is history and is not a reason to do anything. An unfilled one
       * is a live target. Reporting them identically would be reporting a level
       * that has already done its work as though it were still waiting.
       */
      let filled = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= high && candles[j].high >= low) {
          filled = true;
          break;
        }
      }

      results.push({
        pattern: "FAIR_VALUE_GAP",
        timeframe: context.timeframe,
        direction: bullish ? "LONG" : "SHORT",
        quality: 1, // objective: the gap is there, or it is not
        strength: clamp01(size / (minimumSize * 4)),
        detectedAt: third.time,
        startedAt: first.time,
        swings: [],
        // The gap is the target. Price tends to return to the middle of it.
        triggerPrice: (low + high) / 2,
        invalidationPrice: null,
        confirmed: true,
        breakoutPending: false,
        volumeConfirmed: null,
        evidence: [
          `a ${(size * 100).toFixed(2)}% imbalance between ${fmt(low)} and ${fmt(high)} — the middle bar ran so hard that no trading happened in that band`,
          filled
            ? "it has since been filled — this is history, not a live target"
            : "it is UNFILLED — the orders that never got filled are still there",
        ],
        weaknesses: filled
          ? ["the gap has already been filled and has done its work"]
          : [],
      });
    }

    return results;
  },
};

/* ── Order block ───────────────────────────────────────────────────── */

/**
 * ORDER_BLOCK — the candle that CAUSED the move.
 *
 * Detection:  the last opposing candle before an impulsive run of at least 2×
 *             average range.
 * Quality:    scored on the strength of the impulse that followed it.
 *
 * The logic is mechanical, not mystical: an institution cannot fill a large buy at
 * one price without moving the market, so it accumulates INTO the selling. The last
 * down-candle before the launch is where that unfilled size still sits. When price
 * returns, the remainder of the order is waiting.
 *
 * Failure:    an untested block is at its STRONGEST — the resting size is intact.
 *             Every retest consumes it. This is the inverse of a support level's
 *             behaviour, and scoring them the same way would be exactly backwards.
 * Complexity: O(n).
 */
export const orderBlockDetector: IPatternDetector = {
  pattern: "ORDER_BLOCK",
  label: "Order block",
  minimumCandles: 20,
  minimumSwings: 0,

  detect(context) {
    const { candles } = context;
    const results: DetectedPattern[] = [];

    const ranges = candles.map((c) => c.high - c.low);
    const averageRange = ranges.reduce((s, r) => s + r, 0) / Math.max(1, ranges.length);
    if (averageRange <= 0) return [];

    const start = Math.max(1, candles.length - OB_WINDOW);

    for (let i = start; i < candles.length - IMPULSE_BARS; i++) {
      const candle = candles[i];

      const isDown = candle.close < candle.open;
      const isUp = candle.close > candle.open;
      if (!isDown && !isUp) continue;

      const after = candles[i + IMPULSE_BARS];
      const move = after.close - candle.close;
      const impulse = Math.abs(move) / averageRange;

      /*
       * ── The threshold must beat CHANCE, and 2× did not ──
       *
       * This required the move to be 2× the average bar range over 3 bars, and the
       * false-positive suite caught it firing in 70% of pure random walks.
       *
       * The arithmetic is damning. A random walk's expected displacement over n
       * bars is √n times a single bar — so over 3 bars that is **√3 ≈ 1.73×**. A
       * "2× impulse" threshold is therefore barely above what pure chance produces
       * anyway. It was not detecting institutional footprints; it was detecting
       * random walks walking.
       *
       * An impulse must beat the random baseline by a real margin to be evidence of
       * anything. The threshold is now expressed AS a multiple of √n, so it stays
       * honest if `IMPULSE_BARS` is ever changed — the trap here is that someone
       * tunes the bar count and silently re-opens the hole.
       */
      const randomBaseline = Math.sqrt(IMPULSE_BARS);
      if (impulse < randomBaseline * IMPULSE_OVER_CHANCE) continue;

      // The block must OPPOSE the impulse. A green candle before a rally is not an
      // order block, it is just part of the rally.
      const demand = isDown && move > 0;
      const supply = isUp && move < 0;
      if (!demand && !supply) continue;

      const volume = quality.volumeExpansion(context.relativeVolume, i + 1);

      const factors = [
        {
          name: "impulse",
          value: clamp01(impulse / (randomBaseline * IMPULSE_OVER_CHANCE * 2)),
          evidence: `the move that followed ran ${impulse.toFixed(1)}× the average bar range — well beyond the ${randomBaseline.toFixed(1)}× a random walk would produce, so this candle is where the size sat`,
          weakness: `the move that followed was only ${impulse.toFixed(1)}× average range — barely beyond chance, so this is weak evidence of a large order`,
        },
        volume,
      ];

      const verdict = quality.score(factors);

      results.push({
        pattern: "ORDER_BLOCK",
        timeframe: context.timeframe,
        direction: demand ? "LONG" : "SHORT",
        quality: verdict.quality,
        strength: clamp01(impulse / (randomBaseline * IMPULSE_OVER_CHANCE * 2.5)),
        detectedAt: candle.time,
        startedAt: candle.time,
        swings: [],
        triggerPrice: demand ? candle.high : candle.low,
        invalidationPrice: demand ? candle.low : candle.high,
        confirmed: true,
        breakoutPending: false,
        volumeConfirmed: volume.confirmed,
        evidence: [
          `the last ${demand ? "down" : "up"}-candle before a ${impulse.toFixed(1)}× impulsive ${demand ? "rally" : "drop"}`,
          ...verdict.evidence,
        ],
        weaknesses: verdict.weaknesses,
      });
    }

    return results;
  },
};

/* ── helpers ───────────────────────────────────────────────────────── */

function toSwingPoint(swing: Swing) {
  return {
    time: swing.time,
    price: swing.price,
    kind: swing.kind,
    strength: swing.strength,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function fmt(price: number): string {
  if (price >= 1_000) return price.toFixed(0);
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(4);
}

/** Only sweeps in the last 20 bars. Older ones are history. */
const SWEEP_WINDOW = 20;

/** A swing older than this is not a live pool of stops. */
const SWEEP_MAX_AGE = 60;

/** Two swings within 0.3% of each other are the same level — and a pool of stops. */
const EQUAL_TOLERANCE = 0.003;

/**
 * A sweep must penetrate at least a quarter of a typical bar's range.
 *
 * Relative to the instrument's own volatility — see the note in the detector. An
 * absolute floor means "decisive" on BTC and "noise" on a memecoin.
 */
const SWEEP_DEPTH_IN_BARS = 0.25;

/** But never less than this, however dead the instrument is. */
const MINIMUM_SWEEP_DEPTH_FLOOR = 0.001;

const FVG_WINDOW = 40;

/** A gap must span at least a third of a typical bar to be an imbalance at all. */
const GAP_SIZE_IN_BARS = 0.34;

/** But never smaller than this, however dead the instrument is. */
const MINIMUM_GAP_SIZE_FLOOR = 0.0015;

const OB_WINDOW = 40;
const IMPULSE_BARS = 3;

/**
 * How far past pure chance an impulse must run.
 *
 * A random walk displaces √n bar-ranges over n bars (√3 ≈ 1.73 here). Requiring
 * 1.9× THAT — about 3.3× the average bar range — means an order block is evidence
 * of something rather than evidence of a market existing.
 */
const IMPULSE_OVER_CHANCE = 1.9;
