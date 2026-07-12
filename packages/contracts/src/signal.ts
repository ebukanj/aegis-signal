import { z } from "zod";
import {
  confidenceSchema,
  marketRegimeSchema,
  marketTypeSchema,
  priceSchema,
  riskLevelSchema,
  signalDirectionSchema,
  signalOutcomeSchema,
  signalStatusSchema,
  timeSeriesPointSchema,
  timestampSchema,
  timeframeSchema,
} from "./domain";
import {
  LEVERAGE_MATCHES_MARKET_TYPE,
  SHORT_IS_PERPETUAL,
  STOP_ON_INVALIDATION_SIDE,
  leverageMatchesMarketType,
  shortImpliesPerpetual,
  stopIsOnInvalidationSide,
} from "./invariants";

/**
 * The Signal — the single output of Aegis Signal (AGENTS.md §1).
 *
 * Every field here is produced by the backend pipeline. The frontend renders
 * these values; it never computes them.
 */

/* ── Execution guidance (Risk Engine output, ADR-021 §3) ───────────── */

/**
 * The fields that tell a trader exactly how to take the trade.
 *
 * These are decided deterministically by the RISK ENGINE from risk level, stop
 * distance, volatility and timeframe. AI never sets leverage. The frontend
 * never computes it.
 */
export const executionGuidanceSchema = z
  .object({
    marketType: marketTypeSchema,
    /** Suggested leverage for PERPETUAL trades; null for SPOT. */
    suggestedLeverage: z.number().int().positive().nullable(),
  })
  .refine(leverageMatchesMarketType, LEVERAGE_MATCHES_MARKET_TYPE);
export type ExecutionGuidance = z.infer<typeof executionGuidanceSchema>;

/* ── Signal detail ─────────────────────────────────────────────────── */

export const confidenceContributorSchema = z.object({
  name: z.string(),
  score: confidenceSchema,
  note: z.string(),
});
export type ConfidenceContributor = z.infer<typeof confidenceContributorSchema>;

export const riskFactorSchema = z.object({
  name: z.string(),
  rating: riskLevelSchema,
  note: z.string(),
  /** False for factors the backend does not measure yet (funding, OI). */
  available: z.boolean(),
});
export type RiskFactor = z.infer<typeof riskFactorSchema>;

export const checklistItemSchema = z.object({
  label: z.string(),
  passed: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const strategyExplanationContentSchema = z.object({
  /** One-paragraph plain-language summary of why the signal exists. */
  summary: z.string(),
  conditions: z.array(z.string()),
  filters: z.array(z.string()),
  confirmations: z.array(z.string()),
});
export type StrategyExplanationContent = z.infer<
  typeof strategyExplanationContentSchema
>;

export const strategyStatsSchema = z.object({
  winRate: z.number().min(0).max(100),
  /** Average R multiple. */
  avgReturnR: z.number(),
  avgDrawdown: z.number(),
  profitFactor: z.number().nonnegative(),
  /** Realized expectancy in R. Negative means the strategy should be disabled. */
  expectancy: z.number(),
  totalTrades: z.number().int().nonnegative(),
  equityCurve: z.array(timeSeriesPointSchema),
});
export type StrategyStats = z.infer<typeof strategyStatsSchema>;

export const similarSignalSchema = z.object({
  id: z.string(),
  closedAt: timestampSchema,
  coin: z.string(),
  strategy: z.string(),
  outcome: signalOutcomeSchema,
  returnR: z.number(),
  holdingHours: z.number().nonnegative(),
  confidence: confidenceSchema,
});
export type SimilarSignal = z.infer<typeof similarSignalSchema>;

export const signalDetailSchema = z
  .object({
    id: z.string(),
    coin: z.string(),
    pair: z.string(),
    exchange: z.string(),
    direction: signalDirectionSchema,
    /**
     * Contributing strategies — index 0 is primary. Length > 1 means
     * confluence: independent strategies agreed and were fused into ONE
     * signal (ADR-021 §1). Never empty.
     */
    strategies: z.array(z.string()).min(1),
    timeframe: timeframeSchema,
    status: signalStatusSchema,
    regime: marketRegimeSchema,
    confidence: confidenceSchema,
    riskLevel: riskLevelSchema,

    marketType: marketTypeSchema,
    suggestedLeverage: z.number().int().positive().nullable(),
    /** Within today's prime budget — only these trigger notifications. */
    isPrime: z.boolean(),

    generatedAt: timestampSchema,
    expiresAt: timestampSchema,

    entryPrice: priceSchema,
    stopLoss: priceSchema,
    /** TP1..TP3, ordered. At least one target is required. */
    takeProfits: z.array(priceSchema).min(1),
    expectedR: z.number(),
    /** Percent of position lost at stop. */
    maxRiskPercent: z.number().nonnegative(),
    estimatedHoldingHours: z.number().nonnegative(),
    /** Null until portfolio settings exist. */
    suggestedRiskPercent: z.number().positive().nullable(),

    confidenceBreakdown: z.array(confidenceContributorSchema),
    explanation: strategyExplanationContentSchema,
    checklist: z.array(checklistItemSchema),

    riskFactors: z.array(riskFactorSchema),
    /** 0–100 aggregate exposure heat. */
    heatScore: z.number().min(0).max(100),
    warnings: z.array(z.string()),

    strategyStats: strategyStatsSchema,
    similarSignals: z.array(similarSignalSchema),
  })
  .refine(shortImpliesPerpetual, SHORT_IS_PERPETUAL)
  .refine(leverageMatchesMarketType, LEVERAGE_MATCHES_MARKET_TYPE)
  .refine(stopIsOnInvalidationSide, STOP_ON_INVALIDATION_SIDE)
  .refine(
    (s) =>
      s.direction === "LONG"
        ? s.takeProfits.every((tp) => tp > s.entryPrice)
        : s.takeProfits.every((tp) => tp < s.entryPrice),
    {
      message:
        "Every take profit must sit beyond entry in the direction of the trade",
      path: ["takeProfits"],
    },
  );
export type SignalDetail = z.infer<typeof signalDetailSchema>;

/** Detail plus rank-ordered neighbours for prev/next navigation. */
export const signalDetailResponseSchema = z.object({
  detail: signalDetailSchema,
  prevId: z.string().nullable(),
  nextId: z.string().nullable(),
});
export type SignalDetailResponse = z.infer<typeof signalDetailResponseSchema>;

/* ── AI commentary (explains; never decides — AGENTS.md §6) ─────────── */

export const aiCommentarySchema = z.object({
  marketSummary: z.string(),
  signalExplanation: z.string(),
  scenarios: z.array(z.object({ title: z.string(), detail: z.string() })),
  riskCommentary: z.string(),
  invalidations: z.array(z.string()),
  monitor: z.array(z.string()),
});
export type AICommentary = z.infer<typeof aiCommentarySchema>;
