import { z } from "zod";
import {
  marketRegimeSchema,
  marketTypeSchema,
  signalDirectionSchema,
  timeframeSchema,
} from "./domain";
import { exchangeIdSchema } from "./enums/platform";
import { epochMsSchema, priceSchema, rMultipleSchema, symbolSchema } from "./common/value-objects";
import { calibratedConfidenceSchema, calibrationPointSchema } from "./confidence";
import { confluenceReportSchema, signalScoreSchema } from "./signal-engine";

/**
 * The Outcome Ledger — the permanent memory of the platform.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SIGNALS ARE TEMPORARY. HISTORY IS PERMANENT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything else in the platform answers a question about the present: does a
 * setup exist, is it acceptable, how much has it earned, is it worth publishing.
 * The ledger answers the only question that can never be revised — *what actually
 * happened?* — and it answers it once, immutably, forever.
 *
 * The rule that governs every shape in this file: **the ledger never edits
 * history.** A settled outcome is a matter of record. Corrections are APPENDED as
 * new events, never written over the old ones, because a track record you can
 * quietly revise is not a track record — it is marketing with a database behind it
 * (06-STRATEGIES §5). This is the foundation the Confidence Engine calibrates
 * against, and if it can be edited, every number downstream becomes a rumour.
 */

/* ── What actually happened ────────────────────────────────────────── */

/**
 * The canonical outcomes. Determined by MARKET DATA, never by a human — a trader
 * who says "I got out at breakeven" is telling you about their trade, not about
 * the signal, and the ledger records the signal.
 */
export const outcomeTypeSchema = z.enum([
  /** A target was hit before the stop. */
  "WINNER",
  /** The stop was hit before any target. */
  "LOSER",
  /** Some targets hit, then the stop — a scaled exit that still made money. */
  "PARTIAL_WINNER",
  /** Some targets hit, then the stop, net negative. */
  "PARTIAL_LOSER",
  /** Price returned to entry and the trade closed flat. */
  "BREAKEVEN",
  /** Neither target nor stop within the horizon. Capital committed, nothing earned. */
  "EXPIRED",
  /** Price never reached the entry. The trade never happened. */
  "CANCELLED",
  /**
   * The setup was invalidated before it could resolve — a risk flag on the coin, a
   * regime break. Not a loss the strategy made; a trade the platform pulled.
   */
  "INVALIDATED",
]);
export type OutcomeType = z.infer<typeof outcomeTypeSchema>;

/** Why the trade ended — the specific event, more granular than the outcome. */
export const exitReasonSchema = z.enum([
  "TARGET_1",
  "TARGET_2",
  "TARGET_3",
  "STOP_LOSS",
  "EXPIRY",
  "NEVER_TRIGGERED",
  "INVALIDATION",
]);
export type ExitReason = z.infer<typeof exitReasonSchema>;

/**
 * The settlement — the arithmetic of what the trade did, computed from market data
 * and frozen.
 *
 * MFE and MAE are the two numbers most platforms never record and most traders
 * most need. **MFE** (maximum favourable excursion) is how far the trade went in
 * your favour before it closed — a trade that reached 2.8R and settled at 1R tells
 * you the target was too far or the exit too slow. **MAE** (maximum adverse
 * excursion) is how far it went against you before it worked — a winner that first
 * ran to −0.9R was a near-miss that a slightly tighter stop would have turned into
 * a loss. Together they are how a strategy learns where its stops and targets
 * actually belong.
 */
export const settlementSchema = z
  .object({
    outcome: outcomeTypeSchema,
    exitReason: exitReasonSchema,

    /** Realised R. Positive on a win, −1 on a clean stop, ~0 on breakeven/expiry. */
    realisedR: rMultipleSchema,
    /** Realised profit/loss as a percent of the entry price. */
    pnlPercent: z.number(),

    exitPrice: priceSchema,

    /** How far it ran in favour, in R, before it closed. Always ≥ 0. */
    mfeR: z.number().nonnegative(),
    /** How far it ran against, in R, before it closed. Reported as a POSITIVE number. */
    maeR: z.number().nonnegative(),

    /** Bars from trigger to exit. Zero for a signal that never triggered. */
    barsHeld: z.number().int().nonnegative(),
    triggeredAt: epochMsSchema.nullable(),
    settledAt: epochMsSchema,
  })
  .refine((s) => s.outcome !== "CANCELLED" || s.triggeredAt === null, {
    message: "A cancelled signal never triggered — it cannot carry a trigger time",
    path: ["triggeredAt"],
  })
  .refine((s) => s.mfeR >= 0 && s.maeR >= 0, {
    message: "Excursions are magnitudes — both are reported as non-negative",
    path: ["maeR"],
  });
export type Settlement = z.infer<typeof settlementSchema>;

/* ── The immutable record ──────────────────────────────────────────── */

/**
 * A ledger entry — the complete, permanent snapshot of one published signal.
 *
 * ── It carries EVERYTHING, so nothing downstream ever regenerates history ──
 *
 * The evidence, the confidence, the confluence, the risk — all frozen exactly as
 * they were at publication. The Confidence Engine calibrates against this without
 * ever re-running a strategy; the Track Record is built from this without ever
 * re-reading a chart. If a downstream engine had to *recreate* the past to use it,
 * that recreation could differ from what actually happened — and then the platform
 * would be calibrating against a fiction of its own making. So the past is stored,
 * not recomputed.
 *
 * `settlement` is null while the trade is open and set exactly once, forever, when
 * it closes.
 */
export const ledgerEntrySchema = z.object({
  /** The signal's deterministic id. The ledger entry IS the signal, settled. */
  signalId: z.string(),

  strategyId: z.string(),
  strategyVersion: z.number().int().positive(),
  /** The exact rules that fired. History traces to the version that produced it. */
  rulesHash: z.string(),

  symbol: symbolSchema,
  exchange: exchangeIdSchema,
  market: marketTypeSchema,
  timeframe: timeframeSchema,
  direction: signalDirectionSchema,
  regime: marketRegimeSchema,

  entryPrice: priceSchema,
  stopLoss: priceSchema,
  takeProfits: z.array(priceSchema).min(1),

  /** The three measures, frozen. The evidence that justified the trade. */
  confidence: calibratedConfidenceSchema,
  confluence: confluenceReportSchema,
  signalScore: signalScoreSchema,
  calibrationVersion: z.number().int().nonnegative(),

  publishedAt: epochMsSchema,
  barTime: epochMsSchema,

  /** Null until the trade closes. Set exactly once, then immutable. */
  settlement: settlementSchema.nullable(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/* ── The audit trail ───────────────────────────────────────────────── */

/** Every mutation of the ledger, appended. Nothing is ever silently changed. */
export const auditActionSchema = z.enum([
  "CREATED",
  "TRIGGERED",
  "SETTLED",
  "ARCHIVED",
  "CORRECTION",
  "REPLAY",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEventSchema = z.object({
  signalId: z.string(),
  action: auditActionSchema,
  /** What changed, in words. "settled WINNER at TARGET_1, +3.0R". */
  detail: z.string(),
  at: epochMsSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/* ── Strategy statistics ───────────────────────────────────────────── */

/**
 * A strategy's record, from settled outcomes only.
 *
 * `sampleSize` is deliberately the field a reader hits first: a 100% win rate over
 * three trades is three coin flips, and every other number here is meaningless
 * until this one is large. Sharpe and Sortino are named in the spec as FUTURE —
 * they need a returns series over time the platform has not accumulated yet, and a
 * Sharpe over eleven trades would be noise wearing a Greek letter.
 */
export const strategyStatisticsSchema = z.object({
  strategyId: z.string(),
  rulesHash: z.string(),

  sampleSize: z.number().int().nonnegative(),
  winners: z.number().int().nonnegative(),
  losers: z.number().int().nonnegative(),
  breakeven: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),

  winRate: z.number().min(0).max(1).nullable(),
  /** Mean R across settled trades — the only number that says it makes money. */
  expectancy: rMultipleSchema.nullable(),
  /** Gross win R ÷ gross loss R. Null when nothing has lost yet. */
  profitFactor: z.number().nonnegative().nullable(),
  averageReturnR: rMultipleSchema.nullable(),
  averageHoldingBars: z.number().nonnegative().nullable(),
  averageConfidence: z.number().min(0).max(100).nullable(),

  /** Worst peak-to-trough of the R equity curve. */
  maxDrawdownR: z.number().nonnegative().nullable(),
  /** Total R ÷ max drawdown. How much pain bought the return. */
  recoveryFactor: z.number().nullable(),
});
export type StrategyStatistics = z.infer<typeof strategyStatisticsSchema>;

/* ── The public track record ───────────────────────────────────────── */

/** One point on a performance curve, indexed by settlement order. */
export const curvePointSchema = z.object({
  at: epochMsSchema,
  value: z.number(),
});
export type CurvePoint = z.infer<typeof curvePointSchema>;

export const performanceCurvesSchema = z.object({
  /** Cumulative R over time. The headline. */
  equityR: z.array(curvePointSchema),
  /** Rolling win rate. */
  winRate: z.array(curvePointSchema),
  /** Rolling expectancy in R. */
  expectancy: z.array(curvePointSchema),
  /** Underwater plot — drawdown from the running peak, in R. */
  drawdownR: z.array(curvePointSchema),
});
export type PerformanceCurves = z.infer<typeof performanceCurvesSchema>;

/**
 * The public-facing track record — what the platform has actually done.
 *
 * This is the number a trader checks before trusting anything else the platform
 * says, and it is built from settled outcomes only. It is allowed to be
 * unimpressive; it is not allowed to be untrue.
 */
export const trackRecordSchema = z.object({
  totalSignals: z.number().int().nonnegative(),
  settled: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),

  winRate: z.number().min(0).max(1).nullable(),
  averageReturnR: rMultipleSchema.nullable(),
  expectancy: rMultipleSchema.nullable(),
  profitFactor: z.number().nonnegative().nullable(),
  totalR: rMultipleSchema,

  largestWinnerR: rMultipleSchema.nullable(),
  largestLoserR: rMultipleSchema.nullable(),

  currentStreak: z.number().int(),
  longestWinStreak: z.number().int().nonnegative(),
  longestLossStreak: z.number().int().nonnegative(),

  averageConfidenceWinners: z.number().min(0).max(100).nullable(),
  averageConfidenceLosers: z.number().min(0).max(100).nullable(),

  byStrategy: z.array(strategyStatisticsSchema),
  curves: performanceCurvesSchema,

  /**
   * The honest headline. Until enough signals have SETTLED, every number above is
   * provisional, and this says so in words rather than letting a small sample
   * masquerade as a record.
   */
  basis: z.enum(["NO_DATA", "PROVISIONAL", "ESTABLISHED"]),
});
export type TrackRecord = z.infer<typeof trackRecordSchema>;

/* ── The public Track Record page view (read API) ──────────────────── */

/** One strategy's headline record, for the Track Record table. */
export const strategyRecordRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  signals: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  avgR: z.number().nullable(),
  expectancy: z.number().nullable(),
});
export type StrategyRecordRow = z.infer<typeof strategyRecordRowSchema>;

/**
 * What the Track Record page renders — the ledger's headline numbers PLUS the
 * Confidence Engine's reliability curve, side by side.
 *
 * The two belong together and are still kept apart: the ledger says what the
 * platform DID (win rate, R, per strategy), and the calibration curve says how
 * well its CONFIDENCE held up ("when we said 90, we were right X%"). One is the
 * record; the other is the honesty of the number on each signal (ADR-024).
 * `historicalCalibration` is the replay curve; `calibration` becomes the live one
 * as settled outcomes accumulate — never merged.
 */
export const trackRecordViewSchema = z.object({
  settledSignals: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  avgR: z.number().nullable(),
  expectancy: z.number().nullable(),
  trackingDays: z.number().int().nonnegative(),
  totalR: z.number(),
  profitFactor: z.number().nonnegative().nullable(),
  largestWinnerR: z.number().nullable(),
  largestLoserR: z.number().nullable(),
  longestWinStreak: z.number().int().nonnegative(),
  longestLossStreak: z.number().int().nonnegative(),

  strategies: z.array(strategyRecordRowSchema),

  /** Out-of-sample reliability: predicted vs actual per score bucket. */
  calibration: z.array(calibrationPointSchema),
  historicalCalibration: z.array(calibrationPointSchema),

  /** NO_DATA / PROVISIONAL / ESTABLISHED — the honesty of the record above. */
  basis: z.enum(["NO_DATA", "PROVISIONAL", "ESTABLISHED"]),
});
export type TrackRecordView = z.infer<typeof trackRecordViewSchema>;
