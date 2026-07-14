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

/**
 * These MOVED to `common/value-objects.ts` and are re-exported here only so the
 * existing `import { priceSchema } from "@aegis/contracts"` keeps working.
 *
 * They are not redefined. Two definitions of one truth is precisely the drift
 * this package exists to prevent — a `priceSchema` here saying `.positive()`
 * while one there says `.nonnegative()` is a bug that compiles, and it would
 * surface as a division by zero in the position calculator.
 *
 * Add new primitives to value-objects.ts. Never here.
 */
export {
  confidenceSchema,
  timestampSchema,
  priceSchema,
  timeSeriesPointSchema,
} from "./common/value-objects";
export type { TimeSeriesPoint } from "./common/value-objects";
