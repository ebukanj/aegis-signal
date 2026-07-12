import { z } from "zod";

/**
 * Domain enums — the vocabulary of Aegis Signal.
 *
 * Each enum is declared ONCE, as a Zod schema, and its TypeScript type is
 * inferred from it. There is no second declaration anywhere in the repo:
 * `apps/web` and `apps/api` both import from here (AGENTS.md §2).
 */

export const marketRegimeSchema = z.enum([
  "TRENDING_BULL",
  "TRENDING_BEAR",
  "RANGE",
  "TRANSITION",
  "HIGH_VOLATILITY",
  "RISK_OFF",
]);
export type MarketRegime = z.infer<typeof marketRegimeSchema>;

export const riskLevelSchema = z.enum([
  "LOW",
  "MODERATE",
  "ELEVATED",
  "HIGH",
]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const signalDirectionSchema = z.enum(["LONG", "SHORT"]);
export type SignalDirection = z.infer<typeof signalDirectionSchema>;

export const serviceStatusSchema = z.enum([
  "OPERATIONAL",
  "DEGRADED",
  "DOWN",
]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const activityKindSchema = z.enum([
  "SIGNAL",
  "STRATEGY_CHANGE",
  "NOTIFICATION",
  "SYSTEM",
]);
export type ActivityKind = z.infer<typeof activityKindSchema>;

/** Lifecycle of a scanner opportunity. */
export const opportunityStatusSchema = z.enum([
  "ACTIVE",
  "WATCHLIST",
  "EXPIRING",
]);
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;

/** Lifecycle of a published signal. */
export const signalStatusSchema = z.enum([
  "ACTIVE",
  "TRIGGERED",
  "COMPLETED",
  "STOPPED",
  "EXPIRED",
]);
export type SignalStatus = z.infer<typeof signalStatusSchema>;

/** Outcome of a closed historical signal. */
export const signalOutcomeSchema = z.enum(["WIN", "LOSS", "BREAKEVEN"]);
export type SignalOutcome = z.infer<typeof signalOutcomeSchema>;

export const timeframeSchema = z.enum(["15m", "1h", "4h", "1d"]);
export type Timeframe = z.infer<typeof timeframeSchema>;

/**
 * How the trade should be executed.
 *
 * Decided by the RISK ENGINE, never by the frontend and never by AI
 * (ADR-021 §3). SHORT is always PERPETUAL — spot cannot be shorted.
 */
export const marketTypeSchema = z.enum(["SPOT", "PERPETUAL"]);
export type MarketType = z.infer<typeof marketTypeSchema>;

/* ── Shared primitives ─────────────────────────────────────────────── */

/** A confidence score. Calibrated against realized outcomes, never asserted. */
export const confidenceSchema = z.number().min(0).max(100);

/** ISO-8601 timestamp, e.g. "2026-07-12T09:30:00.000Z". */
export const timestampSchema = z.iso.datetime();

/** A strictly positive price. Rejects the 0 and NaN a broken feed would send. */
export const priceSchema = z.number().positive().finite();

/** One point on a time series (equity curve, price history). */
export const timeSeriesPointSchema = z.object({
  /** Unix seconds. */
  time: z.number().int(),
  value: z.number(),
});
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;
