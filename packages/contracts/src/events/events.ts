import { z } from "zod";
import { marketRegimeSchema, timeframeSchema } from "../domain";
import { exchangeIdSchema, notificationChannelSchema } from "../enums/platform";
import { rejectionGateSchema } from "../enums/lifecycle";
import { signalOutcomeSchema, signalStatusSchema } from "../domain";
import {
  confidenceSchema,
  pairSchema,
  rMultipleSchema,
  ratioSchema,
  timestampSchema,
  uuidSchema,
} from "../common/value-objects";

/**
 * The events the pipeline emits.
 *
 * Modules communicate through these rather than by calling each other
 * (Philosophy 5). That decoupling is not architectural fashion — it is what lets
 * the Risk Engine sit *immovably* between strategy and signal.
 *
 * If the Strategy Engine called the Signal Engine directly, someone would
 * eventually add a "fast path" that skipped risk validation, and the one rule
 * with no exceptions would have an exception. It cannot skip a stage it does not
 * know exists.
 *
 * **The order below is the pipeline, and the pipeline is immutable**
 * (AGENTS.md §5). Note that there is no event between `CandidateCreated` and
 * `RiskValidated` / `RiskRejected`. There is nowhere to squeeze one in.
 */

/** Every event carries these. `correlationId` traces a signal back to the scan. */
const eventBase = {
  eventId: uuidSchema,
  occurredAt: timestampSchema,
  correlationId: uuidSchema,
};

export const EVENT = {
  MARKET_UPDATED: "market.updated",
  INDICATORS_CALCULATED: "market.indicators-calculated",
  PATTERN_DETECTED: "market.pattern-detected",
  MARKET_CONDITION_CHANGED: "market.condition-changed",

  STRATEGY_EVALUATED: "strategy.evaluated",
  CANDIDATE_CREATED: "signal.candidate-created",

  /* ── Nothing may be inserted between here… ─────────────────────── */
  RISK_VALIDATED: "signal.risk-validated",
  RISK_REJECTED: "signal.risk-rejected",
  /* ── …and here. ───────────────────────────────────────────────── */

  SIGNAL_CREATED: "signal.created",
  PRIME_SELECTED: "signal.prime-selected",

  /* ── The Signal Engine's publication verdicts (M10) ────────────── */
  SIGNAL_PUBLISHED: "signal.published",
  /** A complete, approved candidate that was NOT published, and why. */
  SIGNAL_SUPPRESSED: "signal.suppressed",
  /** A published signal advanced through its lifecycle. */
  SIGNAL_LIFECYCLE_CHANGED: "signal.lifecycle-changed",

  NOTIFICATION_QUEUED: "notification.queued",
  SIGNAL_SETTLED: "signal.settled",
  OUTCOME_RECORDED: "ledger.outcome-recorded",
  CALIBRATION_UPDATED: "confidence.calibration-updated",
  RISK_FLAG_RAISED: "insight.risk-flag-raised",
  STRATEGY_AUTO_DISABLED: "strategy.auto-disabled",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];

/* ── Market ────────────────────────────────────────────────────────── */

export const marketUpdatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.MARKET_UPDATED),
  exchange: exchangeIdSchema,
  pair: pairSchema,
  timeframe: timeframeSchema,
  /** Open time of the candle that just CLOSED. Forming candles emit nothing. */
  closedCandleTime: z.number().int(),
});
export type MarketUpdated = z.infer<typeof marketUpdatedSchema>;

export const indicatorsCalculatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.INDICATORS_CALCULATED),
  pair: pairSchema,
  timeframe: timeframeSchema,
  indicators: z.array(z.string()),
});
export type IndicatorsCalculated = z.infer<typeof indicatorsCalculatedSchema>;

export const patternDetectedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.PATTERN_DETECTED),
  pair: pairSchema,
  timeframe: timeframeSchema,
  pattern: z.string(),
  quality: z.number().min(0).max(1),
});
export type PatternDetected = z.infer<typeof patternDetectedSchema>;

/**
 * The market changed character. This GATES the strategies.
 *
 * It is what stops a breakout module and a mean-reversion module from firing on
 * the same chart — the classic failure that makes a signal product produce
 * contradictory advice and lose money in both directions.
 */
export const marketConditionChangedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.MARKET_CONDITION_CHANGED),
  from: marketRegimeSchema,
  to: marketRegimeSchema,
  /** Strategies suppressed by the new condition. */
  suppressedStrategies: z.array(z.string()),
});
export type MarketConditionChanged = z.infer<
  typeof marketConditionChangedSchema
>;

/* ── Strategy ──────────────────────────────────────────────────────── */

export const strategyEvaluatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.STRATEGY_EVALUATED),
  strategyId: z.string(),
  pair: pairSchema,
  timeframe: timeframeSchema,
  matched: z.boolean(),
});
export type StrategyEvaluated = z.infer<typeof strategyEvaluatedSchema>;

export const candidateCreatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.CANDIDATE_CREATED),
  candidateId: uuidSchema,
  strategyId: z.string(),
  pair: pairSchema,
});
export type CandidateCreated = z.infer<typeof candidateCreatedSchema>;

/* ── Risk — the gate nothing may skip ──────────────────────────────── */

export const riskValidatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.RISK_VALIDATED),
  candidateId: uuidSchema,
  pair: pairSchema,
});
export type RiskValidated = z.infer<typeof riskValidatedSchema>;

/**
 * A rejection carries the gate AND the measured reason.
 *
 * "Rejected" alone is not evidence. "spread 0.081% > 0.05% limit" is. The
 * Scanner renders these, and they are the only thing that makes a quiet day
 * credible rather than suspicious.
 */
export const riskRejectedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.RISK_REJECTED),
  candidateId: uuidSchema,
  pair: pairSchema,
  gate: rejectionGateSchema,
  reason: z.string().min(1),
});
export type RiskRejected = z.infer<typeof riskRejectedSchema>;

/* ── Signal ────────────────────────────────────────────────────────── */

export const signalCreatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.SIGNAL_CREATED),
  signalId: uuidSchema,
  pair: pairSchema,
  /** Every strategy that agreed. Length > 1 is confluence (ADR-021). */
  strategies: z.array(z.string()).min(1),
  confidence: confidenceSchema,
});
export type SignalCreated = z.infer<typeof signalCreatedSchema>;

/** Prime is immutable once awarded, and the day's budget is auditable. */
export const primeSelectedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.PRIME_SELECTED),
  signalId: uuidSchema,
  pair: pairSchema,
  confidence: confidenceSchema,
  /** Which of the day's ~5 slots this took. */
  slot: z.number().int().positive(),
  budgetTotal: z.number().int().positive(),
});
export type PrimeSelected = z.infer<typeof primeSelectedSchema>;

export const notificationQueuedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.NOTIFICATION_QUEUED),
  signalId: uuidSchema,
  channels: z.array(notificationChannelSchema).min(1),
});
export type NotificationQueued = z.infer<typeof notificationQueuedSchema>;

/* ── Publication (M10) ─────────────────────────────────────────────── */

/**
 * A signal was published to the internal event stream — the platform's single
 * output (AGENTS.md §1). `signalId` is DETERMINISTIC (not a UUID): the same bar
 * always produces the same id, which is what makes replay reproducible and
 * deduplication possible.
 */
export const signalPublishedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.SIGNAL_PUBLISHED),
  signalId: z.string(),
  pair: pairSchema,
  strategies: z.array(z.string()).min(1),
  isPrime: z.boolean(),
  signalScore: z.number().min(0).max(100),
  confidence: confidenceSchema,
});
export type SignalPublished = z.infer<typeof signalPublishedSchema>;

/**
 * A complete, risk-approved, confidence-scored candidate that was NOT published.
 *
 * This is the event that makes a quiet day auditable. Silence is a feature, but a
 * silence that cannot say why is indistinguishable from a broken pipeline — so
 * every suppression names the gate it died at and what it measured.
 */
export const signalSuppressedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.SIGNAL_SUPPRESSED),
  pair: pairSchema,
  strategies: z.array(z.string()).min(1),
  gate: rejectionGateSchema,
  reason: z.string().min(1),
});
export type SignalSuppressed = z.infer<typeof signalSuppressedSchema>;

/** A published signal moved through its lifecycle. Every transition is recorded. */
export const signalLifecycleChangedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.SIGNAL_LIFECYCLE_CHANGED),
  signalId: z.string(),
  from: signalStatusSchema,
  to: signalStatusSchema,
});
export type SignalLifecycleChanged = z.infer<typeof signalLifecycleChangedSchema>;

/* ── The ledger — where trust is earned ────────────────────────────── */

export const signalSettledSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.SIGNAL_SETTLED),
  signalId: uuidSchema,
  outcome: signalOutcomeSchema,
  realisedR: rMultipleSchema,
});
export type SignalSettled = z.infer<typeof signalSettledSchema>;

export const outcomeRecordedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.OUTCOME_RECORDED),
  signalId: uuidSchema,
  strategies: z.array(z.string()).min(1),
  outcome: signalOutcomeSchema,
  realisedR: rMultipleSchema,
  /** The score the platform claimed. Compared against reality by calibration. */
  claimedConfidence: confidenceSchema,
});
export type OutcomeRecorded = z.infer<typeof outcomeRecordedSchema>;

/**
 * The reliability curve moved.
 *
 * This is the platform grading itself. If `actualWinRate` sits below
 * `scoreBucket`, we are overconfident at that score — talking traders into trades
 * with a number we have not earned — and the scorer must be retuned (ADR-024).
 */
export const calibrationUpdatedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.CALIBRATION_UPDATED),
  scoreBucket: z.number().int(),
  actualWinRate: ratioSchema,
  samples: z.number().int().nonnegative(),
  basis: z.enum(["HISTORICAL", "BLENDED", "LIVE"]),
});
export type CalibrationUpdated = z.infer<typeof calibrationUpdatedSchema>;

/* ── Vetoes ────────────────────────────────────────────────────────── */

/** A coin was hacked or depegged. Every strategy is now forbidden to touch it. */
export const riskFlagRaisedSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.RISK_FLAG_RAISED),
  coin: z.string(),
  kind: z.string(),
  blockedUntil: timestampSchema,
});
export type RiskFlagRaised = z.infer<typeof riskFlagRaisedSchema>;

/** A strategy's rolling expectancy went negative. The platform switched it off. */
export const strategyAutoDisabledSchema = z.object({
  ...eventBase,
  name: z.literal(EVENT.STRATEGY_AUTO_DISABLED),
  strategyId: z.string(),
  rollingExpectancy: rMultipleSchema,
  signalsConsidered: z.number().int().positive(),
});
export type StrategyAutoDisabled = z.infer<typeof strategyAutoDisabledSchema>;

/* ── The union ─────────────────────────────────────────────────────── */

/**
 * Every event, discriminated by `name`.
 *
 * A listener that switches on this union gets an exhaustiveness check for free —
 * so adding a pipeline stage without handling it becomes a compile error rather
 * than a silently ignored event.
 */
export const platformEventSchema = z.discriminatedUnion("name", [
  marketUpdatedSchema,
  indicatorsCalculatedSchema,
  patternDetectedSchema,
  marketConditionChangedSchema,
  strategyEvaluatedSchema,
  candidateCreatedSchema,
  riskValidatedSchema,
  riskRejectedSchema,
  signalCreatedSchema,
  primeSelectedSchema,
  signalPublishedSchema,
  signalSuppressedSchema,
  signalLifecycleChangedSchema,
  notificationQueuedSchema,
  signalSettledSchema,
  outcomeRecordedSchema,
  calibrationUpdatedSchema,
  riskFlagRaisedSchema,
  strategyAutoDisabledSchema,
]);
export type PlatformEvent = z.infer<typeof platformEventSchema>;
