import type { DetectedPattern, Pattern } from "@aegis/contracts";
import type {
  DetectionContext,
  IPatternDetector,
} from "../../domain/pattern.interface";
import { MINIMUM_REPORTABLE_QUALITY } from "../../domain/pattern.interface";
import type { Swing } from "../../domain/swing";
import { QualityEngine } from "../services/quality.engine";
import {
  convergence,
  fitTrendline,
  isFlat,
  normalizedSlope,
  parallelism,
  priceAt,
  respects,
  MINIMUM_POINTS_FOR_MEANINGFUL_FIT,
  type Trendline,
} from "../geometry/trendline";

const quality = new QualityEngine();

/**
 * The GEOMETRIC family — wedges, triangles, channels, flags, pennants.
 *
 * Every one of them is: fit a line through the swing highs, fit a line through the
 * swing lows, and ask how the two relate.
 *
 *   converging + both falling      → falling wedge
 *   converging + both rising       → rising wedge
 *   converging + flat top          → descending triangle
 *   converging + flat bottom       → ascending triangle
 *   converging + opposite slopes   → symmetrical triangle
 *   parallel   + rising            → ascending channel
 *   parallel   + falling           → descending channel
 *
 * ── The trap, and it is the whole reason this file is careful ──
 *
 * **Any two points define a line.** A detector that draws a line through two swing
 * highs and announces a trendline has demonstrated nothing except that two points
 * exist. Feed random noise to a naive implementation and it will find wedges and
 * triangles all day long, each one geometrically flawless and completely
 * meaningless.
 *
 * Four things stand between this engine and that:
 *
 *   1. **Three touches minimum.** With two points R² is 1.0 by construction.
 *   2. **R² must be high.** Do the swings actually LIE on the line, or were they
 *      merely connected by it?
 *   3. **Price must RESPECT the line.** Three swing highs on a line is a
 *      coincidence if price closed above that line four times in between. This is
 *      the check naive detectors leave out, and it kills the most false positives.
 *   4. **The swings must be PROMINENT.** Geometry built on pivots that are 0.05%
 *      above their neighbours is geometry built on rounding errors.
 *
 * The false-positive suite feeds this engine random walks and asserts it finds
 * almost nothing. That test is the point of the four rules above.
 */

/** The shared machinery. Every geometric pattern is a variation on this. */
function fitChannel(context: DetectionContext, lookback: number): {
  upper: Trendline;
  lower: Trendline;
  highs: Swing[];
  lows: Swing[];
  fromIndex: number;
  toIndex: number;
} | null {
  const { swings, candles } = context;

  const earliest = Math.max(0, candles.length - lookback);
  const recent = swings.filter((s) => s.index >= earliest);

  const highs = recent.filter((s) => s.kind === "HIGH");
  const lows = recent.filter((s) => s.kind === "LOW");

  // THREE touches on each line. Two would fit perfectly and prove nothing.
  if (
    highs.length < MINIMUM_POINTS_FOR_MEANINGFUL_FIT ||
    lows.length < MINIMUM_POINTS_FOR_MEANINGFUL_FIT
  ) {
    return null;
  }

  const upper = fitTrendline(highs);
  const lower = fitTrendline(lows);
  if (!upper || !lower) return null;

  const fromIndex = Math.min(highs[0].index, lows[0].index);
  const toIndex = candles.length - 1;

  // The lines have crossed. Not a pattern — a mess, and naming it would be
  // inventing a shape that is not there.
  if (priceAt(upper, fromIndex) <= priceAt(lower, fromIndex)) return null;

  return { upper, lower, highs, lows, fromIndex, toIndex };
}

/**
 * Build the detection, or return nothing.
 *
 * Returns `[]` rather than a low-quality detection when the geometry does not hold.
 * A wedge at quality 0.3 is not a low-quality wedge — it is two lines drawn through
 * noise, and shipping it "for the strategy to filter" floods the Confluence layer
 * with junk. "Several low-quality patterns agree" is exactly the false confidence
 * this platform exists to refuse.
 */
function build(input: {
  pattern: Pattern;
  context: DetectionContext;
  direction: DetectedPattern["direction"];
  fit: NonNullable<ReturnType<typeof fitChannel>>;
  extraFactors?: { name: string; value: number; evidence: string; weakness?: string }[];
  triggerPrice: number | null;
  invalidationPrice: number | null;
  impliedMove: number;
  headline: string;
}): DetectedPattern[] {
  const { pattern, context, fit, direction } = input;
  const { upper, lower, highs, lows, fromIndex, toIndex } = fit;
  const { candles } = context;

  // Did price actually respect the lines, or wander through them?
  const upperRespect = respects(upper, candles, fromIndex, toIndex, "ABOVE");
  const lowerRespect = respects(lower, candles, fromIndex, toIndex, "BELOW");

  const factors = [
    quality.trendlineFit(upper.rSquared, "upper trendline"),
    quality.trendlineFit(lower.rSquared, "lower trendline"),
    quality.respect(upperRespect.touches, upperRespect.violations, "upper trendline"),
    quality.respect(lowerRespect.touches, lowerRespect.violations, "lower trendline"),
    quality.swingProminence([...highs, ...lows]),
    ...(input.extraFactors ?? []),
  ];

  const verdict = quality.score(factors);

  // The floor. Below it, this is not a pattern.
  if (verdict.quality < MINIMUM_REPORTABLE_QUALITY) return [];

  const last = candles.at(-1)!;

  const volume = quality.volumeExpansion(context.relativeVolume, candles.length - 1);

  /*
   * Has the breakout happened, or is it pending?
   *
   * A flag that has not broken out is a SETUP; one that has is an EVENT. Both are
   * worth knowing about and a boolean `detected` cannot tell them apart — which is
   * why the contract carries `confirmed` and `breakoutPending` separately.
   */
  const brokenOut =
    input.triggerPrice !== null &&
    (direction === "LONG"
      ? last.close > input.triggerPrice
      : last.close < input.triggerPrice);

  return [
    {
      pattern,
      timeframe: context.timeframe,
      direction,
      quality: verdict.quality,
      strength: quality.significance({
        candles,
        fromIndex,
        toIndex,
        impliedMove: input.impliedMove,
      }),
      detectedAt: last.time,
      startedAt: candles[fromIndex].time,
      swings: [...highs, ...lows]
        .sort((a, b) => a.index - b.index)
        .map(toSwingPoint),
      triggerPrice: input.triggerPrice,
      invalidationPrice: input.invalidationPrice,
      confirmed: true,
      breakoutPending: !brokenOut,
      volumeConfirmed: brokenOut ? volume.confirmed : null,
      evidence: [input.headline, ...verdict.evidence],
      weaknesses: verdict.weaknesses,
    },
  ];
}

/* ── Wedges ────────────────────────────────────────────────────────── */

/**
 * FALLING_WEDGE — converging lines, both falling. Bullish.
 *
 * Geometry:   upper and lower trendlines both slope DOWN and CONVERGE.
 * Meaning:    price is still making lower highs and lower lows, but the lows are
 *             falling MORE SLOWLY than the highs — sellers are running out of room.
 *             The compression is the tell, not the direction.
 * Quality:    R² of both lines × price's respect for them × swing prominence ×
 *             how cleanly they converge.
 * Trigger:    a close above the upper line.
 * Failure:    in a strong downtrend, a falling wedge is often just... the
 *             downtrend, and it breaks DOWN. The pattern is a statement about
 *             compression, not a promise about direction, and the quality score
 *             cannot fix that. The strategy must confirm with structure.
 * Complexity: O(bars + swings).
 */
function wedgeDetector(
  pattern: "FALLING_WEDGE" | "RISING_WEDGE",
): IPatternDetector {
  const falling = pattern === "FALLING_WEDGE";

  return {
    pattern,
    label: falling ? "Falling wedge" : "Rising wedge",
    minimumCandles: 30,
    minimumSwings: 6,

    detect(context) {
      const fit = fitChannel(context, WEDGE_LOOKBACK);
      if (!fit) return [];

      const { upper, lower, fromIndex, toIndex } = fit;

      const upperSlope = normalizedSlope(upper, toIndex);
      const lowerSlope = normalizedSlope(lower, toIndex);

      // BOTH lines must slope the same way. That is what makes it a wedge rather
      // than a triangle.
      const bothFalling = upperSlope < -SLOPE_FLOOR && lowerSlope < -SLOPE_FLOOR;
      const bothRising = upperSlope > SLOPE_FLOOR && lowerSlope > SLOPE_FLOOR;

      if (falling && !bothFalling) return [];
      if (!falling && !bothRising) return [];

      const conv = convergence(upper, lower, fromIndex, toIndex);
      if (conv.kind !== "CONVERGING") return [];

      const last = context.candles.at(-1)!;
      const upperNow = priceAt(upper, toIndex);
      const lowerNow = priceAt(lower, toIndex);

      return build({
        pattern,
        context,
        direction: falling ? "LONG" : "SHORT",
        fit,
        extraFactors: [
          {
            name: "convergence",
            value: Math.min(1, conv.ratio / 0.5),
            evidence: `the trendlines have converged ${(conv.ratio * 100).toFixed(0)}% — the range is compressing`,
            weakness: `the trendlines are barely converging (${(conv.ratio * 100).toFixed(0)}%) — this is closer to a channel than a wedge`,
          },
        ],
        triggerPrice: falling ? upperNow : lowerNow,
        invalidationPrice: falling ? lowerNow : upperNow,
        impliedMove: Math.abs(upperNow - lowerNow) / Math.max(last.close, 1e-9),
        headline: falling
          ? `a falling wedge: both trendlines slope down, but the lows are falling more slowly than the highs — sellers are running out of room`
          : `a rising wedge: both trendlines slope up, but the highs are rising more slowly than the lows — buyers are running out of room`,
      });
    },
  };
}

export const fallingWedgeDetector = wedgeDetector("FALLING_WEDGE");
export const risingWedgeDetector = wedgeDetector("RISING_WEDGE");

/* ── Triangles ─────────────────────────────────────────────────────── */

/**
 * ASCENDING_TRIANGLE — a flat ceiling with rising lows.
 *
 * Geometry:   upper line FLAT (|slope| < 0.05%/bar), lower line RISING, converging.
 * Meaning:    buyers keep paying more while the ceiling holds. Every attempt at the
 *             ceiling starts from a higher floor. Eventually the sellers at the
 *             ceiling are exhausted.
 * Trigger:    a close above the flat ceiling.
 * Failure:    the ceiling is only meaningful if price actually TOUCHED it several
 *             times — a "flat top" fitted through three highs that price never went
 *             near is a line, not a ceiling. The `respect` factor handles this.
 * Complexity: O(bars + swings).
 */
function triangleDetector(
  pattern: "ASCENDING_TRIANGLE" | "DESCENDING_TRIANGLE" | "SYMMETRICAL_TRIANGLE",
): IPatternDetector {
  return {
    pattern,
    label:
      pattern === "ASCENDING_TRIANGLE"
        ? "Ascending triangle"
        : pattern === "DESCENDING_TRIANGLE"
          ? "Descending triangle"
          : "Symmetrical triangle",
    minimumCandles: 30,
    minimumSwings: 6,

    detect(context) {
      const fit = fitChannel(context, TRIANGLE_LOOKBACK);
      if (!fit) return [];

      const { upper, lower, fromIndex, toIndex } = fit;

      const conv = convergence(upper, lower, fromIndex, toIndex);
      if (conv.kind !== "CONVERGING") return [];

      const flatTop = isFlat(upper, toIndex);
      const flatBottom = isFlat(lower, toIndex);

      const upperSlope = normalizedSlope(upper, toIndex);
      const lowerSlope = normalizedSlope(lower, toIndex);

      let direction: DetectedPattern["direction"];
      let headline: string;

      if (pattern === "ASCENDING_TRIANGLE") {
        if (!flatTop || lowerSlope <= SLOPE_FLOOR) return [];
        direction = "LONG";
        headline =
          "an ascending triangle: a flat ceiling with rising lows — buyers keep paying more while the ceiling holds";
      } else if (pattern === "DESCENDING_TRIANGLE") {
        if (!flatBottom || upperSlope >= -SLOPE_FLOOR) return [];
        direction = "SHORT";
        headline =
          "a descending triangle: a flat floor with falling highs — sellers keep accepting less while the floor holds";
      } else {
        // Symmetrical: highs falling AND lows rising. Neither line flat.
        if (flatTop || flatBottom) return [];
        if (upperSlope >= -SLOPE_FLOOR || lowerSlope <= SLOPE_FLOOR) return [];

        /*
         * DIRECTION IS NULL, and that is the honest answer.
         *
         * A symmetrical triangle says a big move is coming. It does NOT say which
         * way, and every tool that claims otherwise is guessing dressed as
         * analysis. Assigning it a direction here would hand the Confluence layer a
         * confident bet on a coin flip.
         */
        direction = null;
        headline =
          "a symmetrical triangle: highs falling and lows rising together — the market is coiling. It says a move is coming, NOT which way";
      }

      const last = context.candles.at(-1)!;
      const upperNow = priceAt(upper, toIndex);
      const lowerNow = priceAt(lower, toIndex);

      return build({
        pattern,
        context,
        direction,
        fit,
        extraFactors: [
          {
            name: "convergence",
            value: Math.min(1, conv.ratio / 0.5),
            evidence: `the boundaries have converged ${(conv.ratio * 100).toFixed(0)}%`,
            weakness: `the boundaries are barely converging (${(conv.ratio * 100).toFixed(0)}%)`,
          },
        ],
        triggerPrice:
          direction === "LONG" ? upperNow : direction === "SHORT" ? lowerNow : null,
        invalidationPrice:
          direction === "LONG" ? lowerNow : direction === "SHORT" ? upperNow : null,
        impliedMove: Math.abs(upperNow - lowerNow) / Math.max(last.close, 1e-9),
        headline,
      });
    },
  };
}

export const ascendingTriangleDetector = triangleDetector("ASCENDING_TRIANGLE");
export const descendingTriangleDetector = triangleDetector("DESCENDING_TRIANGLE");
export const symmetricalTriangleDetector = triangleDetector("SYMMETRICAL_TRIANGLE");

/* ── Channels ──────────────────────────────────────────────────────── */

/**
 * ASCENDING_CHANNEL / DESCENDING_CHANNEL — parallel lines, trending.
 *
 * Geometry:   the two trendlines run PARALLEL (the gap between them changes by less
 *             than 15% across the pattern) and both slope the same way.
 * Meaning:    an orderly trend. The upper line is where buyers have repeatedly run
 *             out of steam; the lower is where they reliably reappear.
 * Quality:    includes a PARALLELISM factor — lines that drift apart are not a
 *             channel, they are a broadening formation, and those are refused
 *             (ADR-024) because almost any choppy chart can be fitted to one.
 * Failure:    a channel is a trend, and trends end. This detector says the channel
 *             EXISTS; it says nothing about it continuing.
 * Complexity: O(bars + swings).
 */
function channelDetector(
  pattern: "ASCENDING_CHANNEL" | "DESCENDING_CHANNEL",
): IPatternDetector {
  const ascending = pattern === "ASCENDING_CHANNEL";

  return {
    pattern,
    label: ascending ? "Rising channel" : "Falling channel",
    minimumCandles: 30,
    minimumSwings: 6,

    detect(context) {
      const fit = fitChannel(context, CHANNEL_LOOKBACK);
      if (!fit) return [];

      const { upper, lower, fromIndex, toIndex } = fit;

      const upperSlope = normalizedSlope(upper, toIndex);
      const lowerSlope = normalizedSlope(lower, toIndex);

      const bothRising = upperSlope > SLOPE_FLOOR && lowerSlope > SLOPE_FLOOR;
      const bothFalling = upperSlope < -SLOPE_FLOOR && lowerSlope < -SLOPE_FLOOR;

      if (ascending && !bothRising) return [];
      if (!ascending && !bothFalling) return [];

      const conv = convergence(upper, lower, fromIndex, toIndex);
      if (conv.kind !== "PARALLEL") return [];

      const howParallel = parallelism(upper, lower, fromIndex, toIndex);

      const last = context.candles.at(-1)!;
      const upperNow = priceAt(upper, toIndex);
      const lowerNow = priceAt(lower, toIndex);

      return build({
        pattern,
        context,
        // The direction is the channel's direction, and a trader buys the lower
        // rail. Which of those a strategy wants is the strategy's business.
        direction: ascending ? "LONG" : "SHORT",
        fit,
        extraFactors: [
          {
            name: "parallelism",
            value: howParallel,
            evidence: `the rails run parallel — the gap between them changed by only ${(Math.abs(conv.ratio) * 100).toFixed(0)}%`,
            weakness: `the rails are not really parallel — the gap changed by ${(Math.abs(conv.ratio) * 100).toFixed(0)}%, so this is closer to a wedge`,
          },
        ],
        triggerPrice: ascending ? lowerNow : upperNow,
        invalidationPrice: ascending ? lowerNow * 0.99 : upperNow * 1.01,
        impliedMove: Math.abs(upperNow - lowerNow) / Math.max(last.close, 1e-9),
        headline: ascending
          ? "a rising channel: highs and lows both climbing between two parallel rails"
          : "a falling channel: highs and lows both falling between two parallel rails",
      });
    },
  };
}

export const ascendingChannelDetector = channelDetector("ASCENDING_CHANNEL");
export const descendingChannelDetector = channelDetector("DESCENDING_CHANNEL");

/* ── Flags and pennants ────────────────────────────────────────────── */

/**
 * BULL_FLAG / BEAR_FLAG — a violent move, then a quiet drift against it.
 *
 * Geometry:   a POLE (a sharp, near-vertical run) followed by a shallow
 *             consolidation that slopes gently AGAINST the pole.
 * Meaning:    the move ran, and the pullback is profit-taking rather than a
 *             reversal. The tell is the volume: a flag's consolidation should be
 *             QUIET.
 *
 * ── The volume rule is not decoration, it is the pattern ──
 *
 * Rising volume during the pullback of a bull flag means the sellers are COMMITTED.
 * That is not a pause in an uptrend — it is a reversal in progress, and it is the
 * difference between a flag and a top. The two look identical on a price chart. A
 * detector that ignores volume reports them identically, and that single omission
 * is why most retail flag detectors are worthless.
 *
 * Trigger:    a close above the pole's high (bull).
 * Failure:    a consolidation that runs longer than ~25 bars is not a flag, it is a
 *             range, and the pole is ancient history. The duration factor kills it.
 * Complexity: O(bars).
 */
function flagDetector(pattern: "BULL_FLAG" | "BEAR_FLAG"): IPatternDetector {
  const bull = pattern === "BULL_FLAG";

  return {
    pattern,
    label: bull ? "Bull flag" : "Bear flag",
    minimumCandles: 25,
    minimumSwings: 2,

    detect(context) {
      const { candles } = context;
      const n = candles.length;

      // Search for a pole ending somewhere in the recent past, with a
      // consolidation after it.
      for (
        let consolidationStart = n - MIN_CONSOLIDATION;
        consolidationStart >= n - MAX_CONSOLIDATION && consolidationStart > POLE_BARS;
        consolidationStart--
      ) {
        const poleStart = consolidationStart - POLE_BARS;
        if (poleStart < 0) continue;

        const poleFrom = candles[poleStart];
        const poleTo = candles[consolidationStart];

        const poleMove = (poleTo.close - poleFrom.close) / Math.max(poleFrom.close, 1e-9);

        // The pole must be a RUN, not a drift.
        if (bull && poleMove < MIN_POLE_MOVE) continue;
        if (!bull && poleMove > -MIN_POLE_MOVE) continue;

        const consolidation = candles.slice(consolidationStart, n);
        if (consolidation.length < MIN_CONSOLIDATION) continue;

        const highs = consolidation.map((c) => c.high);
        const lows = consolidation.map((c) => c.low);

        const poleHigh = Math.max(...candles.slice(poleStart, consolidationStart + 1).map((c) => c.high));
        const poleLow = Math.min(...candles.slice(poleStart, consolidationStart + 1).map((c) => c.low));
        const poleRange = poleHigh - poleLow;
        if (poleRange <= 0) continue;

        /*
         * The consolidation must be SHALLOW.
         *
         * A pullback that retraces more than ~62% of the pole is not a flag — it is
         * a failed move. The market gave back most of what it took, and the "flag"
         * is a reversal wearing a flag's clothes.
         */
        const retrace = bull
          ? (poleHigh - Math.min(...lows)) / poleRange
          : (Math.max(...highs) - poleLow) / poleRange;

        if (retrace > MAX_RETRACE) continue;

        // And it must drift AGAINST the pole, or sideways — never with it.
        const drift =
          (consolidation.at(-1)!.close - consolidation[0].close) /
          Math.max(consolidation[0].close, 1e-9);

        if (bull && drift > 0.005) continue;
        if (!bull && drift < -0.005) continue;

        // VOLUME. The factor that separates a flag from a top.
        const volumeFactor = quality.volumeContraction(
          context.relativeVolume,
          consolidationStart,
          n - 1,
        );

        const poleVolume = quality.volumeExpansion(
          context.relativeVolume,
          consolidationStart,
        );

        const factors = [
          {
            name: "pole",
            value: Math.min(1, Math.abs(poleMove) / (MIN_POLE_MOVE * 2.5)),
            evidence: `the pole ran ${(Math.abs(poleMove) * 100).toFixed(1)}% in ${POLE_BARS} bars`,
            weakness: `the pole only ran ${(Math.abs(poleMove) * 100).toFixed(1)}% — that is a drift, not an impulse`,
          },
          {
            name: "retracement",
            value: Math.max(0, 1 - retrace / MAX_RETRACE),
            evidence: `the consolidation gave back only ${(retrace * 100).toFixed(0)}% of the pole`,
            weakness: `the consolidation gave back ${(retrace * 100).toFixed(0)}% of the pole — too much of the move has been surrendered`,
          },
          volumeFactor,
          quality.duration(consolidation.length, 8, MAX_CONSOLIDATION),
        ];

        const verdict = quality.score(factors);
        if (verdict.quality < MINIMUM_REPORTABLE_QUALITY) continue;

        const last = candles.at(-1)!;
        const trigger = bull ? poleHigh : poleLow;
        const brokenOut = bull ? last.close > trigger : last.close < trigger;

        return [
          {
            pattern,
            timeframe: context.timeframe,
            direction: bull ? "LONG" : "SHORT",
            quality: verdict.quality,
            strength: quality.significance({
              candles,
              fromIndex: poleStart,
              toIndex: n - 1,
              impliedMove: Math.abs(poleMove),
            }),
            detectedAt: last.time,
            startedAt: poleFrom.time,
            swings: [],
            triggerPrice: trigger,
            invalidationPrice: bull ? Math.min(...lows) : Math.max(...highs),
            confirmed: true,
            breakoutPending: !brokenOut,
            volumeConfirmed: brokenOut
              ? poleVolume.confirmed
              : volumeFactor.confirmed,
            evidence: [
              bull
                ? `a bull flag: a ${(poleMove * 100).toFixed(1)}% pole, then a shallow drift against it`
                : `a bear flag: a ${(Math.abs(poleMove) * 100).toFixed(1)}% pole down, then a shallow drift against it`,
              ...verdict.evidence,
            ],
            weaknesses: verdict.weaknesses,
          },
        ];
      }

      return [];
    },
  };
}

export const bullFlagDetector = flagDetector("BULL_FLAG");
export const bearFlagDetector = flagDetector("BEAR_FLAG");

/**
 * PENNANT — a flag whose consolidation CONVERGES rather than drifting.
 *
 * Geometry:   a pole, then a small symmetrical triangle.
 * Difference: a flag's consolidation is a parallel drift; a pennant's is a coil.
 *             They are cousins and they mean roughly the same thing, which is why
 *             both are in the vocabulary and why this detector is deliberately
 *             strict — an overlapping detector that fires on every flag would
 *             double-count the same evidence in Confluence.
 * Complexity: O(bars + swings).
 */
export const pennantDetector: IPatternDetector = {
  pattern: "PENNANT",
  label: "Pennant",
  minimumCandles: 30,
  minimumSwings: 4,

  detect(context) {
    const { candles, swings } = context;
    const n = candles.length;

    const poleStart = n - PENNANT_TOTAL;
    if (poleStart < 0) return [];

    const consolidationStart = poleStart + POLE_BARS;

    const poleFrom = candles[poleStart];
    const poleTo = candles[consolidationStart];
    const poleMove = (poleTo.close - poleFrom.close) / Math.max(poleFrom.close, 1e-9);

    if (Math.abs(poleMove) < MIN_POLE_MOVE) return [];

    // The consolidation must COIL — that is what makes it a pennant and not a flag.
    const recent = swings.filter((s) => s.index >= consolidationStart);
    const highs = recent.filter((s) => s.kind === "HIGH");
    const lows = recent.filter((s) => s.kind === "LOW");

    if (highs.length < 2 || lows.length < 2) return [];

    const upper = fitTrendline(highs);
    const lower = fitTrendline(lows);
    if (!upper || !lower) return [];

    const conv = convergence(upper, lower, consolidationStart, n - 1);
    if (conv.kind !== "CONVERGING") return [];

    const volumeFactor = quality.volumeContraction(
      context.relativeVolume,
      consolidationStart,
      n - 1,
    );

    const factors = [
      {
        name: "pole",
        value: Math.min(1, Math.abs(poleMove) / (MIN_POLE_MOVE * 2.5)),
        evidence: `the pole ran ${(Math.abs(poleMove) * 100).toFixed(1)}%`,
        weakness: `the pole only ran ${(Math.abs(poleMove) * 100).toFixed(1)}%`,
      },
      {
        name: "coil",
        value: Math.min(1, conv.ratio / 0.5),
        evidence: `the consolidation coiled ${(conv.ratio * 100).toFixed(0)}% tighter`,
        weakness: "the consolidation barely coiled — this is a flag, not a pennant",
      },
      volumeFactor,
      quality.swingProminence([...highs, ...lows]),
    ];

    const verdict = quality.score(factors);
    if (verdict.quality < MINIMUM_REPORTABLE_QUALITY) return [];

    const bull = poleMove > 0;
    const last = candles.at(-1)!;
    const trigger = priceAt(bull ? upper : lower, n - 1);

    return [
      {
        pattern: "PENNANT",
        timeframe: context.timeframe,
        direction: bull ? "LONG" : "SHORT",
        quality: verdict.quality,
        strength: quality.significance({
          candles,
          fromIndex: poleStart,
          toIndex: n - 1,
          impliedMove: Math.abs(poleMove),
        }),
        detectedAt: last.time,
        startedAt: poleFrom.time,
        swings: [...highs, ...lows].sort((a, b) => a.index - b.index).map(toSwingPoint),
        triggerPrice: trigger,
        invalidationPrice: priceAt(bull ? lower : upper, n - 1),
        confirmed: true,
        breakoutPending: bull ? last.close <= trigger : last.close >= trigger,
        volumeConfirmed: volumeFactor.confirmed,
        evidence: [
          `a pennant: a ${(Math.abs(poleMove) * 100).toFixed(1)}% pole followed by a tight coil`,
          ...verdict.evidence,
        ],
        weaknesses: verdict.weaknesses,
      },
    ];
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

/** A slope must exceed this (per bar, as a fraction of price) to count as sloping. */
const SLOPE_FLOOR = 0.0005;

const WEDGE_LOOKBACK = 60;
const TRIANGLE_LOOKBACK = 60;
const CHANNEL_LOOKBACK = 80;

/** The pole: a sharp run over this many bars. */
const POLE_BARS = 5;

/** Below this, the "pole" is a drift. */
const MIN_POLE_MOVE = 0.03;

/** A pullback deeper than this is a failed move, not a flag. */
const MAX_RETRACE = 0.62;

const MIN_CONSOLIDATION = 4;

/** Longer than this and it is a range, not a flag. */
const MAX_CONSOLIDATION = 25;

const PENNANT_TOTAL = 25;
