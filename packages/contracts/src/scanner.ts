import { z } from "zod";
import {
  confidenceSchema,
  marketRegimeSchema,
  marketTypeSchema,
  opportunityStatusSchema,
  priceSchema,
  riskLevelSchema,
  signalDirectionSchema,
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
 * Market Scanner — the ranked feed of every risk-validated opportunity.
 *
 * The scanner shows the full validated set for transparency; only Prime
 * signals (`isPrime`) trigger notifications (ADR-021 §2).
 */

export const opportunitySchema = z
  .object({
    id: z.string(),
    rank: z.number().int().positive(),
    coin: z.string(),
    pair: z.string(),
    exchange: z.string(),
    direction: signalDirectionSchema,
    /** Contributing strategies — length > 1 means confluence (ADR-021 §1). */
    strategies: z.array(z.string()).min(1),
    timeframe: timeframeSchema,
    confidence: confidenceSchema,
    riskLevel: riskLevelSchema,

    /** Execution guidance — Risk Engine output, never computed client-side. */
    marketType: marketTypeSchema,
    suggestedLeverage: z.number().int().positive().nullable(),
    /** Within today's prime budget — only these trigger notifications. */
    isPrime: z.boolean(),

    entryPrice: priceSchema,
    stopLoss: priceSchema,
    takeProfit: priceSchema,
    /** Expected reward-to-risk multiple, e.g. 2.4 */
    rewardRisk: z.number().positive(),

    regime: marketRegimeSchema,
    status: opportunityStatusSchema,
    generatedAt: timestampSchema,
  })
  .refine(shortImpliesPerpetual, SHORT_IS_PERPETUAL)
  .refine(leverageMatchesMarketType, LEVERAGE_MATCHES_MARKET_TYPE)
  .refine(stopIsOnInvalidationSide, STOP_ON_INVALIDATION_SIDE);
export type Opportunity = z.infer<typeof opportunitySchema>;

export const opportunityListSchema = z.array(opportunitySchema);

/* ── The signals feed (Signal Engine read API, M10) ────────────────── */

/** The market backdrop the feed was produced against. */
export const scanContextSchema = z.object({
  regime: marketRegimeSchema,
  riskLevel: riskLevelSchema,
  pairsScanned: z.number().int().nonnegative(),
  exchanges: z.number().int().nonnegative(),
  strategiesActive: z.number().int().nonnegative(),
  lastScanAt: timestampSchema,
  /** How many signals the platform has published in the feed window. */
  published: z.number().int().nonnegative(),
});
export type ScanContext = z.infer<typeof scanContextSchema>;

/**
 * Today's signals — the platform's single output, in two tiers (ADR-021).
 *
 * PRIME is the few the platform will interrupt a trader for; VALIDATED is
 * everything else that published but did not earn a slot. An empty PRIME tier is
 * the honest state until a strategy is proven, not a bug — silence is a feature.
 */
export const signalFeedSchema = z.object({
  context: scanContextSchema,
  prime: opportunityListSchema,
  validated: opportunityListSchema,
});
export type SignalFeed = z.infer<typeof signalFeedSchema>;
