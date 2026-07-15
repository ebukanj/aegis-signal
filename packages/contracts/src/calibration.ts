import { z } from "zod";
import {
  confidenceSchema,
  marketRegimeSchema,
  signalDirectionSchema,
  timeframeSchema,
} from "./domain";
import { riskLevelSchema } from "./domain";
import { exchangeIdSchema } from "./enums/platform";
import { rMultipleSchema, timestampSchema } from "./common/value-objects";
import { volatilityStateSchema } from "./market/regime";
import { calibratedConfidenceSchema } from "./confidence";

/**
 * Calibration — the machinery that turns a SCORE into a PROBABILITY, and the
 * evidence entitling it to.
 *
 * `confidence.ts` holds the shape a signal carries. This holds the shape of the
 * thing that EARNED it: labelled historical setups, a fitted model, and the
 * reliability curve that grades the model in public.
 *
 * ── The one sentence that governs this entire file ──
 *
 *   A score is arithmetic on candles and is real from day one.
 *   A probability is a claim about OUTCOMES and must be earned from them.
 *
 * Everything here exists to keep those two apart, because merging them is how a
 * platform ends up printing a confident 91% that means nothing at all
 * (ADR-024).
 */

/* ── What a replayed setup actually did ────────────────────────────── */

/**
 * The outcome of one historical setup, walked forward bar by bar.
 *
 * ── Why EXPIRED is not BREAKEVEN, and neither is a win ──
 *
 * `signalOutcome` (WIN | LOSS | BREAKEVEN) describes a LIVE signal a human
 * managed — a trader who moved a stop to entry produced a real breakeven. A
 * replayed setup has no manager. It either reached its target, or it reached its
 * stop, or the market wandered off and it did neither before the clock ran out.
 *
 * **EXPIRED is counted as a non-win.** A setup that never resolved did not make
 * money, and quietly dropping expired setups from the denominator is one of the
 * oldest ways to inflate a win rate — you keep every trade that worked and throw
 * away the ones that went nowhere.
 */
export const replayOutcomeSchema = z.enum(["WIN", "LOSS", "EXPIRED"]);
export type ReplayOutcome = z.infer<typeof replayOutcomeSchema>;

/** Coarse buckets. Similarity matches on these, not on raw floats. */
export const volatilityBucketSchema = z.enum(["LOW", "NORMAL", "HIGH", "EXTREME"]);
export type VolatilityBucket = z.infer<typeof volatilityBucketSchema>;

export const liquidityBucketSchema = z.enum(["THIN", "ADEQUATE", "DEEP"]);
export type LiquidityBucket = z.infer<typeof liquidityBucketSchema>;

/**
 * The evidence a setup carried, reduced to the handful of facts we are willing
 * to claim are comparable across time.
 *
 * ── Why buckets and not the raw numbers ──
 *
 * "Find me historical setups where RSI was 63.71" matches nothing, ever. Every
 * setup is unique at full precision, so a similarity search over raw floats
 * returns an empty set and the engine would report UNCALIBRATED forever while
 * appearing to work.
 *
 * Coarsening is therefore not laziness — it is what makes the question
 * answerable. But it is also a CLAIM: that RSI 63.7 and RSI 66.2 are the same
 * kind of evidence. That claim is only defensible for a small number of
 * genuinely regime-like features, which is why this list is short and refuses to
 * grow. Every field added here is another dimension the history must cover, and
 * the corpus does not get any bigger when you add one.
 */
export const evidenceSnapshotSchema = z.object({
  strategyId: z.string(),
  /**
   * WHICH VERSION of the strategy's rules produced this.
   *
   * A setup labelled under one set of rules is not evidence about a different
   * set of rules. When a user edits a strategy, `rulesHash` changes and the old
   * setups stop matching — which is exactly ADR-024's "editing a strategy wipes
   * its track record", enforced here by arithmetic rather than by a delete.
   */
  rulesHash: z.string(),

  symbol: z.string(),
  exchange: exchangeIdSchema,
  timeframe: timeframeSchema,
  direction: signalDirectionSchema,

  regime: marketRegimeSchema,
  volatilityState: volatilityStateSchema,
  volatilityBucket: volatilityBucketSchema,
  liquidityBucket: liquidityBucketSchema,
  riskLevel: riskLevelSchema,

  /** Patterns present at the setup, sorted — so the snapshot is order-stable. */
  patterns: z.array(z.string()),

  /** The raw contributor score this setup carried. Its bucket is what we calibrate. */
  score: confidenceSchema,
});
export type EvidenceSnapshot = z.infer<typeof evidenceSnapshotSchema>;

/** Which half of the walk-forward split a setup belongs to. */
export const corpusSplitSchema = z.enum(["CALIBRATION", "VALIDATION"]);
export type CorpusSplit = z.infer<typeof corpusSplitSchema>;

/**
 * One historical setup, replayed and labelled. The atom of earned confidence.
 *
 * Note what it does NOT contain: any number the platform would like to be true.
 * It contains what the market did.
 */
export const labelledSetupSchema = z.object({
  evidence: evidenceSnapshotSchema,
  barTime: z.number().int(),

  entryPrice: z.number().positive(),
  stopPrice: z.number().positive(),
  targetPrice: z.number().positive(),

  outcome: replayOutcomeSchema,
  /** Realised R. Negative on a loss, ~0 on an expiry marked to the closing bar. */
  realisedR: rMultipleSchema,
  barsHeld: z.number().int().nonnegative(),

  split: corpusSplitSchema,
});
export type LabelledSetup = z.infer<typeof labelledSetupSchema>;

/* ── How well the platform's numbers hold up ───────────────────────── */

/**
 * One rung of the reliability curve: "when we said 90, we were right X% of the
 * time."
 *
 * This is the platform grading itself in public, and it is the single most
 * important artefact in the codebase. If the curve bows below the diagonal, the
 * scorer is overconfident — it is talking traders into trades with a number it
 * has not earned — and it must be retuned. There is no version of this platform
 * where that chart is hidden.
 */
export const reliabilityBinSchema = z.object({
  /** Lower edge of the score bucket, e.g. 90 covers 90–94. */
  bucket: z.number().int(),
  /** What we predicted, on average, in this bucket. */
  predicted: z.number().min(0).max(1),
  /** What actually happened. */
  observed: z.number().min(0).max(1),
  samples: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
});
export type ReliabilityBin = z.infer<typeof reliabilityBinSchema>;

/**
 * How wrong the calibrator is, measured four ways because each hides a different
 * failure.
 *
 * - **Brier** — mean squared error of the probabilities. The headline. Lower is
 *   better; 0.25 is what you get by predicting 50% at everything, so a Brier
 *   above 0.25 means the model is worse than a shrug.
 * - **Log loss** — punishes confident wrongness *savagely* (an assured 99% that
 *   loses costs ~4.6 nats). It is the metric that catches exactly the failure
 *   this platform exists to avoid.
 * - **ECE** — expected calibration error: the average gap between what we said
 *   and what happened, weighted by how often we said it. This is the number a
 *   trader actually feels.
 * - **MCE** — the WORST bucket. A model can have a beautiful ECE and still be
 *   catastrophically wrong in the one bucket where it is most confident, because
 *   that bucket is rare and the average buries it.
 *
 * Reported on the VALIDATION half of the corpus. Reporting them in-sample would
 * be marking your own homework — the model has already seen those outcomes, and
 * a perfect in-sample ECE proves nothing except that the arithmetic ran.
 */
export const reliabilityMetricsSchema = z.object({
  brier: z.number().min(0).max(1),
  logLoss: z.number().nonnegative(),
  ece: z.number().min(0).max(1),
  mce: z.number().min(0).max(1),
  samples: z.number().int().nonnegative(),
  /** The base rate of the sample. A model that cannot beat this is decoration. */
  baseRate: z.number().min(0).max(1),
  curve: z.array(reliabilityBinSchema),
});
export type ReliabilityMetrics = z.infer<typeof reliabilityMetricsSchema>;

/* ── The model ─────────────────────────────────────────────────────── */

/**
 * The three ways a score becomes a probability. All three are fitted from the
 * SAME labelled setups, and the one that ships is the one with the best
 * out-of-sample ECE — not the one anybody preferred.
 */
export const calibrationMethodSchema = z.enum([
  /**
   * Beta-Binomial shrinkage per bucket, backed off through a hierarchy
   * (bucket → strategy → global). The default, because it is the only one of the
   * three that degrades GRACEFULLY: at n=0 it returns the prior and says so,
   * rather than returning a confident number fitted to nothing.
   */
  "SHRINKAGE",
  /**
   * Platt scaling — a one-dimensional logistic fitted to score→outcome. Strong
   * when the relationship really is sigmoid, and it borrows strength across the
   * whole corpus, so it survives sparse buckets. It CANNOT represent a
   * non-monotone scorer, and if the scorer is non-monotone we want to know that
   * rather than smooth it away.
   */
  "PLATT",
  /**
   * Isotonic regression (pool-adjacent-violators). The most flexible — it can
   * fit any monotone relationship exactly. That is also its defect: with few
   * samples it fits the noise perfectly and produces 0% and 100% buckets from a
   * handful of coin flips. Shipped, benchmarked, and expected to LOSE until the
   * corpus is large.
   */
  "ISOTONIC",
]);
export type CalibrationMethod = z.infer<typeof calibrationMethodSchema>;

/** What the model was fitted on. Without this, a win rate is a rumour. */
export const calibrationCorpusSchema = z.object({
  symbols: z.array(z.string()),
  timeframes: z.array(timeframeSchema),
  from: z.number().int(),
  to: z.number().int(),
  /** Where the walk-forward split falls. Everything after it is out-of-sample. */
  splitAt: z.number().int(),
  setups: z.number().int().nonnegative(),
  calibrationSetups: z.number().int().nonnegative(),
  validationSetups: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
});
export type CalibrationCorpus = z.infer<typeof calibrationCorpusSchema>;

/**
 * A fitted, versioned, immutable calibration model.
 *
 * ── Never overwritten. Ever. ──
 *
 * A signal published on Tuesday claimed a number produced by Tuesday's model. If
 * Wednesday's refit silently replaced it, then Tuesday's signal would be
 * retroactively judged against a model that did not exist when it spoke — and
 * the platform's own track record would become unfalsifiable, which is a
 * politer word for fictional.
 *
 * So every signal stores its `calibrationVersion`, and every version stays on
 * disk forever. The reliability curve is then a real experiment: a prediction
 * made in advance, graded afterwards, by a model that cannot go back and change
 * its mind.
 */
export const calibrationModelSchema = z.object({
  version: z.number().int().positive(),
  method: calibrationMethodSchema,
  fittedAt: timestampSchema,

  corpus: calibrationCorpusSchema,

  /**
   * The mapping itself: score bucket → calibrated win probability, plus the
   * evidence behind each rung.
   */
  bins: z.array(reliabilityBinSchema),

  /** Platt's two parameters. Null for the other methods. */
  plattA: z.number().nullable(),
  plattB: z.number().nullable(),

  /** How it scored on data it was FITTED on. Flattering. Reported anyway. */
  inSample: reliabilityMetricsSchema,
  /** How it scored on data it had never seen. **This is the number that counts.** */
  outOfSample: reliabilityMetricsSchema,
});
export type CalibrationModel = z.infer<typeof calibrationModelSchema>;

/* ── A strategy's record ───────────────────────────────────────────── */

/**
 * A strategy's historical performance. Every field is a fact about outcomes; not
 * one of them is a forecast.
 *
 * `samples` is deliberately the field a reader hits first, because it is the one
 * that decides whether any of the others mean anything. A 100% win rate over
 * three setups is not a good strategy — it is three coin flips, and the platform
 * must not let it look like anything more.
 */
export const strategyReliabilitySchema = z.object({
  strategyId: z.string(),
  rulesHash: z.string(),

  samples: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),

  /** Raw, unshrunk. The honest count, before any statistics are applied to it. */
  winRate: z.number().min(0).max(1).nullable(),
  /** After Beta shrinkage toward the global base rate. What we actually believe. */
  shrunkWinRate: z.number().min(0).max(1).nullable(),

  /** Gross profit ÷ gross loss, in R. Null when nothing has lost yet. */
  profitFactor: z.number().nonnegative().nullable(),
  /** Mean R per setup. The only number that says whether the thing makes money. */
  expectancy: rMultipleSchema.nullable(),
  /** Worst peak-to-trough run of the equity curve, in R. */
  maxDrawdownR: z.number().nonnegative().nullable(),
  /** Total R ÷ max drawdown. How much pain bought the return. */
  recoveryFactor: z.number().nullable(),
  averageBarsHeld: z.number().nonnegative().nullable(),

  /** Per-regime, because a strategy is not one strategy in every market. */
  byRegime: z.array(
    z.object({
      regime: marketRegimeSchema,
      samples: z.number().int().nonnegative(),
      winRate: z.number().min(0).max(1).nullable(),
      expectancy: rMultipleSchema.nullable(),
    }),
  ),
});
export type StrategyReliability = z.infer<typeof strategyReliabilitySchema>;

/* ── The report ────────────────────────────────────────────────────── */

/**
 * The named tiers a score falls into.
 *
 * These are LABELS, not probabilities. "VERY_HIGH" means the evidence stacked up
 * unusually well — it does not mean the trade is very likely to win, and the two
 * are only the same thing once the calibration says so.
 */
export const confidenceBucketSchema = z.enum([
  "EXCEPTIONAL",
  "VERY_HIGH",
  "HIGH",
  "MODERATE",
  "LOW",
  "DO_NOT_PUBLISH",
]);
export type ConfidenceBucket = z.infer<typeof confidenceBucketSchema>;

/**
 * The full, clickable answer to "where did this number come from?"
 *
 * Founding Principle 3: *a signal without an explanation is not intelligence.* A
 * user must be able to click any confidence score and reach every input that
 * produced it — the contributors, the history, the model, and the things nobody
 * could check.
 */
export const confidenceReportSchema = z
  .object({
    candidateId: z.string(),
    strategyId: z.string(),

    /** The score, the contributors, and the calibration. Defined in confidence.ts. */
    confidence: calibratedConfidenceSchema,

    bucket: confidenceBucketSchema,
    /** Did it clear the configured publication threshold? */
    publishable: z.boolean(),
    /** Eligible for a Prime slot? UNPROVEN strategies never are (ADR-023 §4). */
    primeEligible: z.boolean(),
    /** Why it is or is not publishable, in words, with the numbers in them. */
    verdict: z.string(),

    /** Which model spoke. Immutable, and stored on the signal forever. */
    calibrationVersion: z.number().int().nonnegative(),
    calibrationMethod: calibrationMethodSchema.nullable(),

    /** The historical setups that resembled this one. */
    similarSetups: z.number().int().nonnegative(),
    similarWinRate: z.number().min(0).max(1).nullable(),

    supporting: z.array(z.string()),
    contradicting: z.array(z.string()),

    /**
     * What nobody could check. Same discipline as the Risk Engine's `unassessed`:
     * a missing measurement must read as MISSING, never as FINE.
     */
    unassessed: z.array(z.string()),

    at: timestampSchema,
  })
  .refine((r) => r.calibrationVersion > 0 || r.calibrationMethod === null, {
    message:
      "An uncalibrated report has no method — there is no model, and naming one would be inventing a provenance",
    path: ["calibrationMethod"],
  })
  .refine((r) => !r.primeEligible || r.publishable, {
    message:
      "A signal that is not fit to publish cannot be Prime — Prime is a subset of published, never an exception to it",
    path: ["primeEligible"],
  });

export type ConfidenceReport = z.infer<typeof confidenceReportSchema>;
