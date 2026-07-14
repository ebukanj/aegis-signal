import type { DetectedPattern } from "@aegis/contracts";
import type {
  DetectionContext,
  IPatternDetector,
} from "../../domain/pattern.interface";
import type { Swing } from "../../domain/swing";
import { StructureEngine } from "../services/structure.engine";

/**
 * The OBJECTIVE detectors.
 *
 * These do not score on a curve. A break of structure is not "0.8 of a break" —
 * price took out the swing high or it did not, and the contract refuses a quality
 * below 1 for them. Inventing doubt to look rigorous is the mirror image of
 * inventing certainty, and just as dishonest.
 */

const structure = new StructureEngine();

/** Shared shape. These have no geometry to score, so most fields are fixed. */
function objective(input: {
  pattern: DetectedPattern["pattern"];
  context: DetectionContext;
  direction: DetectedPattern["direction"];
  swings: Swing[];
  startedAt: number;
  detectedAt: number;
  strength: number;
  evidence: string[];
  triggerPrice?: number | null;
  invalidationPrice?: number | null;
}): DetectedPattern {
  return {
    pattern: input.pattern,
    timeframe: input.context.timeframe,
    direction: input.direction,
    quality: 1, // objective. It happened.
    strength: input.strength,
    detectedAt: input.detectedAt,
    startedAt: input.startedAt,
    swings: input.swings.map(toSwingPoint),
    triggerPrice: input.triggerPrice ?? null,
    invalidationPrice: input.invalidationPrice ?? null,
    confirmed: true,
    breakoutPending: false,
    volumeConfirmed: null,
    evidence: input.evidence,
    weaknesses: [],
  };
}

/* ── Trend structure ───────────────────────────────────────────────── */

/**
 * HIGHER_HIGH_HIGHER_LOW — what an intact uptrend actually IS.
 *
 * Detection:  the last two swing highs are ascending AND the last two swing lows
 *             are ascending. Both. Always both.
 * Geometry:   none — this is a comparison, not a shape.
 * Quality:    1 (objective).
 * Failure:    higher highs with LOWER lows is not an uptrend, it is an expanding
 *             range and one of the most dangerous things to trade with a trend
 *             rule. It reports RANGING, which is the honest answer.
 * Complexity: O(1) given swings.
 */
export const higherHighHigherLowDetector: IPatternDetector = {
  pattern: "HIGHER_HIGH_HIGHER_LOW",
  label: "Uptrend structure",
  minimumCandles: 20,
  minimumSwings: 4,

  detect(context) {
    const state = structure.analyse({
      candles: context.candles,
      swings: context.swings,
      timeframe: context.timeframe,
    });

    if (state.trend !== "UPTREND") return [];

    const highs = context.swings.filter((s) => s.kind === "HIGH").slice(-2);
    const lows = context.swings.filter((s) => s.kind === "LOW").slice(-2);
    const used = [...highs, ...lows].sort((a, b) => a.index - b.index);

    return [
      objective({
        pattern: "HIGHER_HIGH_HIGHER_LOW",
        context,
        direction: "LONG",
        swings: used,
        startedAt: used[0].time,
        detectedAt: context.candles.at(-1)!.time,
        strength: 0.6,
        evidence: [
          `the last two swing highs rose (${fmt(highs[0].price)} → ${fmt(highs[1].price)})`,
          `and the last two swing lows rose (${fmt(lows[0].price)} → ${fmt(lows[1].price)})`,
        ],
        // The trend is over when the last higher low fails.
        invalidationPrice: lows[1].price,
      }),
    ];
  },
};

/** LOWER_HIGH_LOWER_LOW — the mirror. An intact downtrend. */
export const lowerHighLowerLowDetector: IPatternDetector = {
  pattern: "LOWER_HIGH_LOWER_LOW",
  label: "Downtrend structure",
  minimumCandles: 20,
  minimumSwings: 4,

  detect(context) {
    const state = structure.analyse({
      candles: context.candles,
      swings: context.swings,
      timeframe: context.timeframe,
    });

    if (state.trend !== "DOWNTREND") return [];

    const highs = context.swings.filter((s) => s.kind === "HIGH").slice(-2);
    const lows = context.swings.filter((s) => s.kind === "LOW").slice(-2);
    const used = [...highs, ...lows].sort((a, b) => a.index - b.index);

    return [
      objective({
        pattern: "LOWER_HIGH_LOWER_LOW",
        context,
        direction: "SHORT",
        swings: used,
        startedAt: used[0].time,
        detectedAt: context.candles.at(-1)!.time,
        strength: 0.6,
        evidence: [
          `the last two swing highs fell (${fmt(highs[0].price)} → ${fmt(highs[1].price)})`,
          `and the last two swing lows fell (${fmt(lows[0].price)} → ${fmt(lows[1].price)})`,
        ],
        invalidationPrice: highs[1].price,
      }),
    ];
  },
};

/* ── The two events ────────────────────────────────────────────────── */

/**
 * BREAK_OF_STRUCTURE — the trend continued.
 *
 * Detection:  price CLOSED beyond the last swing in the direction of the trend,
 *             within the last 3 bars.
 * Rule:       a CLOSE, never a wick. A wick through a swing is a liquidity sweep —
 *             the market taking the stops and snapping back — and counting it as a
 *             break would report a continuation on the very bar the level was
 *             being defended.
 * Quality:    1 (objective).
 * Failure:    in a RANGE there is no trend to continue, so nothing is reported. A
 *             range breakout is not a break of structure, and calling it one would
 *             let trend strategies fire before any trend exists.
 * Complexity: O(bars).
 */
export const breakOfStructureDetector: IPatternDetector = {
  pattern: "BREAK_OF_STRUCTURE",
  label: "Break of structure",
  minimumCandles: 20,
  minimumSwings: 4,

  detect(context) {
    const state = structure.analyse({
      candles: context.candles,
      swings: context.swings,
      timeframe: context.timeframe,
    });

    if (!state.brokeStructure) return [];

    const long = state.trend === "UPTREND";
    const broken = long ? state.lastSwingHigh : state.lastSwingLow;
    if (!broken) return [];

    const last = context.candles.at(-1)!;
    const swing = context.swings.find((s) => s.time === broken.time);

    return [
      objective({
        pattern: "BREAK_OF_STRUCTURE",
        context,
        direction: long ? "LONG" : "SHORT",
        swings: swing ? [swing] : [],
        startedAt: broken.time,
        detectedAt: last.time,
        // A break of a long-standing swing is a bigger event than a break of last
        // week's noise. Age is the only thing that distinguishes them.
        strength: clamp01(0.4 + (swing ? Math.min(swing.age, 60) / 100 : 0)),
        evidence: [
          `price CLOSED ${long ? "above" : "below"} the last swing ${long ? "high" : "low"} at ${fmt(broken.price)}`,
          `the ${state.trend.toLowerCase()} is continuing, not turning`,
        ],
        invalidationPrice: broken.price,
      }),
    ];
  },
};

/**
 * CHANGE_OF_CHARACTER — the earliest evidence a trend is ending.
 *
 * Detection:  price CLOSED beyond the last swing AGAINST the trend.
 * Quality:    1 (objective).
 *
 * ── Why this is worth more than a break of structure ──
 *
 * A BOS confirms what you already suspected, and by the time you see it the move
 * has started. A CHoCH is the first crack: an uptrend that has been printing higher
 * lows suddenly takes one out. Nothing is confirmed — the trend may well resume —
 * but it arrives long before any moving average has begun to turn, and it is the
 * only warning you get at a price that still makes sense.
 *
 * Conflating the two is expensive in both directions: treat a CHoCH as a BOS and
 * you buy a breakdown; ignore it and you hold through one.
 *
 * Failure:    it fires early by nature. Some CHoCHs are just deep pullbacks, and
 *             this detector cannot tell which — nor should it pretend to. It
 *             reports the structural fact; the Risk Engine decides what to do
 *             about it.
 */
export const changeOfCharacterDetector: IPatternDetector = {
  pattern: "CHANGE_OF_CHARACTER",
  label: "Change of character",
  minimumCandles: 20,
  minimumSwings: 4,

  detect(context) {
    const state = structure.analyse({
      candles: context.candles,
      swings: context.swings,
      timeframe: context.timeframe,
    });

    if (!state.changedCharacter) return [];

    // The trend was UP, so the break was DOWN — and the implication is bearish.
    const wasUptrend = state.trend === "UPTREND";
    const broken = wasUptrend ? state.lastSwingLow : state.lastSwingHigh;
    if (!broken) return [];

    const last = context.candles.at(-1)!;
    const swing = context.swings.find((s) => s.time === broken.time);

    return [
      objective({
        pattern: "CHANGE_OF_CHARACTER",
        context,
        direction: wasUptrend ? "SHORT" : "LONG",
        swings: swing ? [swing] : [],
        startedAt: broken.time,
        detectedAt: last.time,
        strength: clamp01(0.5 + (swing ? Math.min(swing.age, 60) / 100 : 0)),
        evidence: [
          `price CLOSED ${wasUptrend ? "below" : "above"} the last swing ${wasUptrend ? "low" : "high"} at ${fmt(broken.price)} — AGAINST the trend`,
          `this is the first structural crack in the ${state.trend.toLowerCase()}, and the earliest warning available`,
        ],
        invalidationPrice: broken.price,
      }),
    ];
  },
};

/* ── Range ─────────────────────────────────────────────────────────── */

/**
 * RANGE — a floor and a ceiling, and price going nowhere between them.
 *
 * Detection:  swing highs cluster at one level, swing lows at another, and price
 *             has stayed between them.
 * Direction:  NULL, always. A range is not bullish or bearish — it is the ABSENCE
 *             of both, and the contract allows a null direction precisely so this
 *             does not have to lie about having one.
 * Quality:    scored — how tightly do the highs and lows actually cluster?
 * Failure:    a range that is 20% wide is not a range, it is a market. The width
 *             must be modest relative to the instrument's volatility.
 * Complexity: O(swings).
 */
export const rangeDetector: IPatternDetector = {
  pattern: "RANGE",
  label: "Range",
  minimumCandles: 30,
  minimumSwings: 4,

  detect(context) {
    const state = structure.analyse({
      candles: context.candles,
      swings: context.swings,
      timeframe: context.timeframe,
    });

    if (state.trend !== "RANGING") return [];

    const highs = context.swings.filter((s) => s.kind === "HIGH").slice(-3);
    const lows = context.swings.filter((s) => s.kind === "LOW").slice(-3);

    if (highs.length < 2 || lows.length < 2) return [];

    const ceiling = mean(highs.map((s) => s.price));
    const floor = mean(lows.map((s) => s.price));

    if (ceiling <= floor) return [];

    // How tightly do the highs agree with each other, and the lows with each other?
    // A "range" whose ceiling touches are 3% apart is not a ceiling.
    const ceilingSpread = spread(highs.map((s) => s.price)) / ceiling;
    const floorSpread = spread(lows.map((s) => s.price)) / floor;

    const tightness = clamp01(1 - (ceilingSpread + floorSpread) / 0.03);
    if (tightness < 0.3) return [];

    const used = [...highs, ...lows].sort((a, b) => a.index - b.index);
    const last = context.candles.at(-1)!;

    return [
      {
        pattern: "RANGE",
        timeframe: context.timeframe,
        direction: null, // the absence of a direction, honestly stated
        quality: tightness,
        strength: clamp01((ceiling - floor) / ceiling / 0.05),
        detectedAt: last.time,
        startedAt: used[0].time,
        swings: used.map(toSwingPoint),
        triggerPrice: null,
        invalidationPrice: null,
        confirmed: true,
        breakoutPending: false,
        volumeConfirmed: null,
        evidence: [
          `price is bounded between a floor near ${fmt(floor)} and a ceiling near ${fmt(ceiling)}`,
          `the highs agree to within ${(ceilingSpread * 100).toFixed(2)}% and the lows to within ${(floorSpread * 100).toFixed(2)}%`,
        ],
        weaknesses:
          tightness < 0.6
            ? ["the boundaries are loose — this is a zone of chop rather than a clean range"]
            : [],
      },
    ];
  },
};

/* ── Equal highs / equal lows ──────────────────────────────────────── */

/**
 * EQUAL_HIGHS / EQUAL_LOWS — a liquidity pool, in plain sight.
 *
 * Detection:  two or more swings of the same kind within 0.15% of each other.
 * Quality:    1 (objective — "within 0.15%" is a measurement, not a reading).
 *
 * ── What these actually mean, and why they are NOT support ──
 *
 * Under equal lows sits a pile of stop orders. Every trader who bought the first
 * low put their stop just beneath it; every trader who bought the second did the
 * same. The level LOOKS like support and is in fact a **target**: the resting stops
 * there are the liquidity a large order needs in order to fill at all.
 *
 * This is the single most expensive misreading in retail trading — placing a stop
 * just under an obvious double bottom, which is precisely where the market is most
 * likely to reach before it reverses. The Reversal strategy trades the SWEEP of
 * these, not the "support" they appear to be.
 *
 * Failure:    on a very quiet instrument almost every pair of swings is "equal".
 *             The prominence floor is what stops this reporting a pool on every
 *             flat stretch.
 * Complexity: O(swings log swings).
 */
function equalDetector(
  pattern: "EQUAL_HIGHS" | "EQUAL_LOWS",
  kind: "HIGH" | "LOW",
): IPatternDetector {
  return {
    pattern,
    label: kind === "HIGH" ? "Equal highs" : "Equal lows",
    minimumCandles: 25,
    minimumSwings: 2,

    detect(context) {
      const relevant = context.swings.filter((s) => s.kind === kind);
      if (relevant.length < 2) return [];

      const results: DetectedPattern[] = [];

      // The last two of this kind. Older pairs are history, and reporting every
      // pair that was ever equal would bury the caller.
      const [a, b] = relevant.slice(-2);

      const difference = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
      if (difference > EQUAL_TOLERANCE) return [];

      // Two flat wiggles are not a liquidity pool. Without this, every quiet
      // stretch of chart reports one.
      if (a.prominence < 0.003 || b.prominence < 0.003) return [];

      const last = context.candles.at(-1)!;

      results.push({
        pattern,
        timeframe: context.timeframe,
        // The pool sits ABOVE equal highs, so price is likely to be drawn UP into
        // it — and then to reverse. The direction is the direction of the SWEEP,
        // not of the trade that follows it. That distinction belongs to the
        // strategy, not to us.
        direction: kind === "HIGH" ? "LONG" : "SHORT",
        quality: 1,
        strength: clamp01(1 - difference / EQUAL_TOLERANCE),
        detectedAt: last.time,
        startedAt: a.time,
        swings: [a, b].map(toSwingPoint),
        triggerPrice: Math.max(a.price, b.price),
        invalidationPrice: null,
        confirmed: true,
        breakoutPending: false,
        volumeConfirmed: null,
        evidence: [
          `two swing ${kind === "HIGH" ? "highs" : "lows"} sit within ${(difference * 100).toFixed(3)}% of each other (${fmt(a.price)} and ${fmt(b.price)})`,
          `a pool of stop orders rests ${kind === "HIGH" ? "above" : "below"} them — this is a magnet, not a wall`,
        ],
        weaknesses: [],
      });

      return results;
    },
  };
}

export const equalHighsDetector = equalDetector("EQUAL_HIGHS", "HIGH");
export const equalLowsDetector = equalDetector("EQUAL_LOWS", "LOW");

/* ── helpers ───────────────────────────────────────────────────────── */

function toSwingPoint(swing: Swing) {
  return {
    time: swing.time,
    price: swing.price,
    kind: swing.kind,
    strength: swing.strength,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Prices are shown to a sensible precision for the instrument's scale. */
function fmt(price: number): string {
  if (price >= 1_000) return price.toFixed(0);
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(4);
}

const EQUAL_TOLERANCE = 0.0015;
