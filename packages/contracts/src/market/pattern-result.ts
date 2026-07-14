import { z } from "zod";
import { signalDirectionSchema, timeframeSchema } from "../domain";
import { GEOMETRIC_PATTERNS, OBJECTIVE_PATTERNS, patternSchema } from "../strategy";
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

    /**
     * Has the pattern actually COMPLETED, or is it still forming?
     *
     * A bull flag that has not broken out is a bull flag that may yet become a
     * breakdown. Both are worth knowing about and they are not the same thing, and
     * a boolean `detected` cannot tell them apart. An unconfirmed pattern is a
     * *setup*; a confirmed one is an *event*.
     */
    confirmed: z.boolean(),

    /** True while the pattern is complete but price has not yet taken the trigger. */
    breakoutPending: z.boolean(),

    /**
     * Did volume agree?
     *
     * `null` means we could not tell — not "no". A flag that breaks out on volume
     * is a different animal from one that breaks out on nothing, and the second is
     * where false breakouts live.
     */
    volumeConfirmed: z.boolean().nullable(),

    /**
     * Why the detector believes this, in plain English.
     *
     * **The single most important field in this schema.** A pattern engine that
     * returns `BULL_FLAG: true, quality: 0.87` is asking to be trusted; one that
     * says *"the pole ran 6.2% in 4 bars, the consolidation retraced 38% on falling
     * volume, and the trendlines fit at R²=0.91"* is showing its working, and a
     * human can disagree with it.
     *
     * The platform's whole claim is that a trader can see WHY. This is where a
     * pattern keeps that promise (PRODUCT_BIBLE), and it is what the Confidence
     * Engine will later have to justify itself against.
     */
    evidence: z.array(z.string()),

    /**
     * WHAT IS WRONG WITH IT. Required, and it may be empty only when nothing is.
     *
     * Every detector must be able to argue against itself. A pattern that reports
     * only its strengths is marketing, and the quality score alone cannot carry the
     * nuance: "quality 0.71" tells a trader nothing, while *"the second touch is
     * weak and volume did not confirm"* tells them exactly what they are taking on.
     *
     * This is also the honest defence against a detector that has quietly started
     * firing on noise — the weaknesses pile up long before the quality score falls.
     */
    weaknesses: z.array(z.string()),
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
  )
  /**
   * An OBJECTIVE pattern scores exactly 1, and the schema will not accept less.
   *
   * A break of structure is not "0.8 of a break" — price either took out the swing
   * high or it did not. Scoring it on a curve would be inventing doubt in order to
   * look rigorous, which is the mirror image of inventing certainty and exactly as
   * dishonest. If a detector ever wants to hedge on one of these, the thing to fix
   * is the detector.
   */
  .refine(
    (p) =>
      !(OBJECTIVE_PATTERNS as readonly string[]).includes(p.pattern) ||
      p.quality === 1,
    {
      message:
        "An objective pattern either happened or it did not — it cannot have a quality below 1",
      path: ["quality"],
    },
  )
  /**
   * A pattern that has not completed cannot already have broken out.
   *
   * Nonsense, and the kind of nonsense a detector produces when its state machine
   * is subtly wrong. Cheap to refuse here; expensive to debug from a signal.
   */
  .refine((p) => !(p.breakoutPending && !p.confirmed), {
    message:
      "A pattern cannot be awaiting its breakout before it has even formed",
    path: ["breakoutPending"],
  });
export type DetectedPattern = z.infer<typeof detectedPatternSchema>;

/* ── Zones ─────────────────────────────────────────────────────────── */

/**
 * A zone — standing structure, not an event.
 *
 * A pattern HAPPENS: a flag completes, a structure breaks, at a moment. A zone
 * simply *is*: a band of price that has been defended, with a width, an age, and a
 * history of being retested. Those are not things `DetectedPattern` can hold — it
 * has one `triggerPrice` and one `detectedAt` — so forcing zones into it would
 * flatten away everything that makes a zone useful.
 *
 * ── A zone is a BAND, never a line ──
 *
 * "Resistance at 62,400" is a fiction. Price rejected from 62,380 once and 62,450
 * another time, and orders sit across that whole band. A single line produces a
 * stop placed one tick beyond a level that was never that precise, and it gets
 * taken out by noise that the real zone would have absorbed. The width is not
 * imprecision to be tidied away — it is the measurement.
 */
export const zoneKindSchema = z.enum([
  /** Price has repeatedly turned UP from here. */
  "SUPPORT",
  /** Price has repeatedly turned DOWN from here. */
  "RESISTANCE",
  /** The candle that CAUSED an impulsive move — where the size actually sat. */
  "DEMAND_BLOCK",
  "SUPPLY_BLOCK",
  /**
   * A pool of stop orders — under equal lows, above equal highs.
   *
   * Not a level price respects. A level price is DRAWN TO, because the stops
   * resting there are the liquidity a large order needs in order to fill.
   */
  "LIQUIDITY_POOL",
]);
export type ZoneKind = z.infer<typeof zoneKindSchema>;

export const zoneSchema = z
  .object({
    kind: zoneKindSchema,
    timeframe: timeframeSchema,

    /** The band. `low <= high`, always — enforced below. */
    low: priceSchema,
    high: priceSchema,

    /** When the zone was first established. */
    createdAt: epochMsSchema,
    /** The most recent bar that interacted with it. Null if never retested. */
    lastTouchedAt: epochMsSchema.nullable(),

    /**
     * How many times price came back and the zone HELD.
     *
     * More retests is not linearly better, and treating it that way is a classic
     * error. A level tested twice and holding is strong. A level tested seven
     * times is a level being worn down — each test consumes the orders that make
     * it a level. `strength` accounts for this; a raw count does not.
     */
    retests: z.number().int().nonnegative(),

    /** 0–1. How much this zone has actually proven itself. */
    strength: z.number().min(0).max(1),

    /** The swings that define it. Its working, shown. */
    swings: z.array(swingPointSchema),

    /**
     * True once price has closed decisively through it.
     *
     * A broken zone is not deleted — it is kept, because a broken resistance
     * routinely becomes support, and a strategy that has forgotten the level
     * cannot see the retest.
     */
    broken: z.boolean(),
  })
  .refine((z_) => z_.high >= z_.low, {
    message: "A zone's high cannot sit below its low",
    path: ["high"],
  })
  .refine((z_) => z_.lastTouchedAt === null || z_.lastTouchedAt >= z_.createdAt, {
    message: "A zone cannot be touched before it existed",
    path: ["lastTouchedAt"],
  });
export type Zone = z.infer<typeof zoneSchema>;

/** Everything the pattern engine found on one pair, one timeframe. */
export const patternSetSchema = z.object({
  pair: z.string(),
  timeframe: timeframeSchema,
  patterns: z.array(detectedPatternSchema),
  zones: z.array(zoneSchema).default([]),
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
