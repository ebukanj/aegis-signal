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
