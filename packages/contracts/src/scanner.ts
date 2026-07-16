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

    /**
     * The live last price at the moment the row was produced. Null when the
     * platform has no price yet — the UI says "waiting" rather than inventing one.
     * The signal feed leaves this null (live price streams over the socket); the
     * Scanner populates it so a trader sees how far price sits from the entry.
     */
    currentPrice: priceSchema.nullable().default(null),

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

/* ── On-demand Market Scanner (M15) ────────────────────────────────── */

/**
 * A scan the user asked for, right now. This is the same live pipeline the
 * background worker runs — market data → indicators → patterns → regime →
 * strategy → risk → confidence — but scoped to what the toolbar selected and
 * returned synchronously with its diagnostics, rather than published.
 *
 * `market` / `timeframe` / `exchange` of `"ALL"` (or omitted) mean "do not
 * filter that dimension". The scan never invents a universe; it enumerates the
 * symbols the enabled exchanges actually list.
 */
export const scanRequestSchema = z.object({
  market: z.enum(["SPOT", "PERPETUAL", "ALL"]).default("ALL"),
  timeframe: z.union([timeframeSchema, z.literal("ALL")]).default("ALL"),
  exchange: z.string().default("ALL"),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

/**
 * The result of a scan: the ranked opportunities that passed strategy AND risk,
 * plus the honest diagnostics a trader needs to trust a small number — how many
 * pairs were actually checked, across how many exchanges, and how long it took.
 * Zero passes is a valid, common answer, not an error.
 */
export const scanResultSchema = z.object({
  opportunities: opportunityListSchema,
  pairsChecked: z.number().int().nonnegative(),
  exchanges: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  scannedAt: timestampSchema,
  /**
   * True while a sweep is running right now. A full sweep of the universe takes
   * minutes (rate limits are real), so the API NEVER runs one inside a request —
   * it returns the latest completed sweep immediately and reports the running one
   * here, so the UI can poll and flip when fresh numbers land.
   */
  inProgress: z.boolean().default(false),

  /**
   * WHY candidates died, grouped and counted — the evidence under a thin result.
   * A zero with reasons ("no break of structure × 214") is the strategies being
   * selective; a zero without them is indistinguishable from a broken pipeline,
   * and a trader who cannot tell the difference stops trusting the quiet days.
   */
  topRejections: z.array(z.object({ reason: z.string(), count: z.number().int() })).default([]),
});
export type ScanResult = z.infer<typeof scanResultSchema>;
