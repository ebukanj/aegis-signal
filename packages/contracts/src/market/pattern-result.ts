import { z } from "zod";
import { signalDirectionSchema, timeframeSchema } from "../domain";
import { GEOMETRIC_PATTERNS, patternSchema } from "../strategy";
import { epochMsSchema, priceSchema } from "../common/value-objects";

/**
 * What a pattern engine returns when it finds something.
 *
 * The vocabulary of patterns lives in `strategy.ts` (a strategy may *ask* for a
 * bull flag). This file is the *answer* — what the detector found, how cleanly,
 * and where.
 *
 * DELIBERATELY ABSENT, and the schema refuses them: head & shoulders, inverse
 * head & shoulders, cup & handle, Elliott waves. Ten traders draw them ten
 * different ways. A deterministic detector for them would be inventing
 * certainty, which is the one thing this platform exists not to do (ADR-024).
 * There is a test asserting this, and it is not an oversight to be helpfully
 * fixed.
 */

/**
 * A swing point — the atom every pattern is built from.
 *
 * Get this wrong and everything above it is wrong: structure, break of
 * structure, wedges, flags, divergence. It is the single highest-leverage
 * calculation in the pattern engine and the first thing to test.
 */
export const swingPointSchema = z.object({
  time: epochMsSchema,
  price: priceSchema,
  kind: z.enum(["HIGH", "LOW"]),
  /** Bars either side that this point exceeds. Higher = more significant. */
  strength: z.number().int().positive(),
});
export type SwingPoint = z.infer<typeof swingPointSchema>;

/**
 * A detected pattern.
 *
 * `quality` (0–1) is the honest part. Market structure is objective — a break of
 * structure either happened or it did not, and it scores 1. Geometry is a matter
 * of degree: a wedge whose trendlines fit at R²=0.62 is a wedge you can *see* if
 * you want to, and a strategy is entitled to demand 0.75 before it will trade it.
 *
 * A half-formed wedge is a Rorschach test, not a trade.
 */
export const detectedPatternSchema = z
  .object({
    pattern: patternSchema,
    timeframe: timeframeSchema,

    /**
     * Which way it points. Null for patterns that are direction-neutral by
     * nature — a RANGE is not bullish or bearish, it is the absence of both.
     */
    direction: signalDirectionSchema.nullable(),

    /** 0–1. How cleanly formed. Objective structure is always 1. */
    quality: z.number().min(0).max(1),

    /**
     * 0–1. How *significant*, which is not the same as how clean. A textbook
     * flag on a dead 15m chart is high quality and low strength.
     */
    strength: z.number().min(0).max(1),

    /** When the pattern completed. */
    detectedAt: epochMsSchema,
    /** The bar the pattern began forming. */
    startedAt: epochMsSchema,

    /** The swings the detector actually used. Its working, shown. */
    swings: z.array(swingPointSchema),

    /** The price that would confirm it — a flag's breakout level. */
    triggerPrice: priceSchema.nullable(),
    /** The price that would kill it. */
    invalidationPrice: priceSchema.nullable(),
  })
  .refine((p) => p.detectedAt >= p.startedAt, {
    message: "A pattern cannot complete before it began",
    path: ["detectedAt"],
  })
  .refine(
    (p) =>
      !(GEOMETRIC_PATTERNS as readonly string[]).includes(p.pattern) ||
      p.quality > 0,
    {
      message:
        "A geometric pattern with zero quality is not a detection, it is noise",
      path: ["quality"],
    },
  );
export type DetectedPattern = z.infer<typeof detectedPatternSchema>;

/** Everything the pattern engine found on one pair, one timeframe. */
export const patternSetSchema = z.object({
  pair: z.string(),
  timeframe: timeframeSchema,
  patterns: z.array(detectedPatternSchema),
});
export type PatternSet = z.infer<typeof patternSetSchema>;

/* ── Market structure ──────────────────────────────────────────────── */

/**
 * The trend, as structure rather than as a moving average.
 *
 * This is the highest-value thing the pattern engine produces, and it is what a
 * moving average cannot tell you. An EMA lags, and it lags hardest at exactly
 * the moment a trend breaks — so a strategy that checks "price above the 200
 * EMA" is checking whether the trend *was* intact, and buying the first leg down.
 *
 * HH/HL is what an intact uptrend actually *is*.
 */
export const marketStructureSchema = z.object({
  timeframe: timeframeSchema,
  /** UPTREND = higher highs and higher lows. */
  trend: z.enum(["UPTREND", "DOWNTREND", "RANGING", "UNCLEAR"]),
  swings: z.array(swingPointSchema),
  /** The last swing that would have to break to end this trend. */
  lastSwingHigh: swingPointSchema.nullable(),
  lastSwingLow: swingPointSchema.nullable(),
  /** True when price broke a swing WITH the trend — it is continuing. */
  brokeStructure: z.boolean(),
  /**
   * True when price broke a swing AGAINST the trend for the first time.
   * The earliest evidence a trend is ending, and the most valuable.
   */
  changedCharacter: z.boolean(),
});
export type MarketStructure = z.infer<typeof marketStructureSchema>;
