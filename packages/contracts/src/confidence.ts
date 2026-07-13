import { z } from "zod";
import { confidenceSchema, priceSchema, timestampSchema } from "./domain";

/**
 * Confidence, and the price. The two things the platform was lying about.
 *
 * Before ADR-024 the score was literally:
 *
 *     confidence = randInt(52, 92) + (strategies.length - 1) * 4
 *
 * A random number. When the UI rendered "91%" it meant nothing at all — exactly
 * the "bot printing 94% decoratively" that 06-STRATEGIES warned against.
 *
 * The fix rests on one distinction:
 *
 *   THE EVIDENCE IS REAL FROM DAY ONE. "volume 2.3× its 20-bar average",
 *   "RSI 68", "bull flag, quality 0.81" — arithmetic on exchange candles. No
 *   track record needed.
 *
 *   ONLY THE LEAP FROM SCORE → PROBABILITY NEEDS HISTORY. "91 means you win 91%
 *   of the time" is a claim about outcomes, and no amount of live market data
 *   proves it.
 *
 * So the shapes below make the honest thing the only expressible thing.
 */

/* ── The arithmetic behind a score ─────────────────────────────────── */

/** Where a contributor's weight came from. Never "because we said so". */
export const contributorSourceSchema = z.enum([
  /** Measured on this candle right now — volume, RSI, a pattern's quality. */
  "MEASURED",
  /** Derived from the strategy's own settled outcomes. */
  "LEDGER",
  /** Derived from replaying the strategy over exchange history. */
  "HISTORICAL",
  /** A rule from the strategy document (a filter passed, a gate cleared). */
  "RULE",
]);
export type ContributorSource = z.infer<typeof contributorSourceSchema>;

/**
 * One line of the score's arithmetic.
 *
 * Every signal must be able to show its full sum. A number without its working
 * is an assertion, and this platform does not make assertions
 * (Founding Principle 3 — every signal must be explainable).
 */
export const confidenceContributorSchema = z.object({
  name: z.string(),
  /** Points added or removed. Negative is a penalty — crowded funding, resistance overhead. */
  weight: z.number(),
  source: contributorSourceSchema,
  /** The measured value this was derived from, e.g. "2.3× (needed 1.5×)". */
  measured: z.string(),
  note: z.string(),
});
export type ConfidenceContributor = z.infer<typeof confidenceContributorSchema>;

/* ── Turning a score into a probability ────────────────────────────── */

/** Which number the UI is actually allowed to show, and why. */
export const calibrationBasisSchema = z.enum([
  /** No outcomes at all. Show the score, never a probability. */
  "UNCALIBRATED",
  /** Replayed over exchange history. Real, but optimistic — say so. */
  "HISTORICAL",
  /** History plus live results, shrinking toward live as they arrive. */
  "BLENDED",
  /** Enough of our own settled signals. History is dropped. */
  "LIVE",
]);
export type CalibrationBasis = z.infer<typeof calibrationBasisSchema>;

/**
 * A confidence score, and the evidence entitling it to be called a probability.
 *
 * The shape is the point. It is structurally impossible for the API to send a
 * win probability without also sending where it came from and how many outcomes
 * back it. There is nowhere to put a bare "91%".
 *
 *   Day 1    score 91 · 61% historical   (2yr replay, 1,284 setups; 0 live)
 *   Day 30   score 91 · 66% blended      (1,284 historical + 11 live)
 *   Day 90   score 91 · 87% live         (34 live; history dropped)
 *
 * Historical and live are carried separately and are NEVER merged behind one
 * unlabelled number.
 */
export const calibratedConfidenceSchema = z
  .object({
    /** The raw sum of the contributors. Always present, always honest. */
    score: confidenceSchema,
    contributors: z.array(confidenceContributorSchema),

    basis: calibrationBasisSchema,

    /** Win rate of this score bucket when replayed over exchange history. */
    historicalWinRate: z.number().min(0).max(100).nullable(),
    historicalSamples: z.number().int().nonnegative(),

    /** Win rate of this score bucket among our own settled signals. */
    liveWinRate: z.number().min(0).max(100).nullable(),
    liveSamples: z.number().int().nonnegative(),

    /**
     * The probability the UI may display. Null when UNCALIBRATED — and when it
     * is null, the UI must show the score WITHOUT a percent sign and say so.
     */
    displayedWinRate: z.number().min(0).max(100).nullable(),
  })
  .refine(
    (c) => (c.basis === "UNCALIBRATED") === (c.displayedWinRate === null),
    {
      message:
        "An uncalibrated score has no win rate — and a win rate cannot be uncalibrated",
      path: ["displayedWinRate"],
    },
  )
  .refine((c) => c.basis !== "HISTORICAL" || c.historicalSamples > 0, {
    message: "A historical win rate needs historical samples behind it",
    path: ["historicalSamples"],
  })
  .refine((c) => c.basis !== "LIVE" || c.liveSamples > 0, {
    message: "A live win rate needs live samples behind it",
    path: ["liveSamples"],
  });
export type CalibratedConfidence = z.infer<typeof calibratedConfidenceSchema>;

/** One point on the reliability curve: "when we say 90, we are right X%". */
export const calibrationPointSchema = z.object({
  /** Score bucket, e.g. 90 covers 90–94. */
  bucket: z.number().int(),
  predicted: z.number().min(0).max(100),
  actual: z.number().min(0).max(100),
  samples: z.number().int().nonnegative(),
});
export type CalibrationPoint = z.infer<typeof calibrationPointSchema>;

/* ── Live price ────────────────────────────────────────────────────── */

/**
 * How far price has run from the entry the signal named.
 *
 * A signal's entry goes stale the moment it is published. If we said "enter near
 * $145.30" and price is now $149, the trade is gone — chasing it means taking a
 * worse reward-to-risk than the signal promised, or entering after the move.
 *
 * The trader cannot tell an actionable signal from a departed one without this,
 * and "here is a trade worth taking RIGHT NOW" is the whole product.
 *
 * The RISK ENGINE owns this verdict — not the frontend. The frontend renders it
 * (AGENTS.md §6).
 */
export const entryStatusSchema = z.enum([
  /** Price is still at or near the entry. Take it. */
  "AT_ENTRY",
  /** Price has moved in the trade's favour. Entering now buys a worse R:R. */
  "CHASING",
  /** Price has run too far. The trade the signal described no longer exists. */
  "MISSED",
  /** Price already reached the stop. Dead. */
  "INVALIDATED",
]);
export type EntryStatus = z.infer<typeof entryStatusSchema>;

export const livePriceSchema = z.object({
  pair: z.string(),
  price: priceSchema,
  changePercent24h: z.number(),
  at: timestampSchema,
});
export type LivePrice = z.infer<typeof livePriceSchema>;
