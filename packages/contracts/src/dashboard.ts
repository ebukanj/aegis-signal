import { z } from "zod";
import {
  activityKindSchema,
  confidenceSchema,
  marketRegimeSchema,
  priceSchema,
  riskLevelSchema,
  serviceStatusSchema,
  signalDirectionSchema,
  timeSeriesPointSchema,
  timestampSchema,
} from "./domain";

/**
 * Dashboard — answers one question: "What should I know right now?"
 * (PRD §17.)
 */

export const marketIntelligenceSchema = z.object({
  regime: marketRegimeSchema,
  regimeConfidence: confidenceSchema,
  /** 0–100, fear → greed. */
  sentiment: z.number().min(0).max(100),
  sentimentLabel: z.string(),
  riskLevel: riskLevelSchema,
  riskScore: z.number().min(0).max(100),
  activeOpportunities: z.number().int().nonnegative(),
  watchlistCount: z.number().int().nonnegative(),
  btcDominance: z.number().min(0).max(100),
});
export type MarketIntelligence = z.infer<typeof marketIntelligenceSchema>;

export const platformHealthSchema = z.object({
  scanner: serviceStatusSchema,
  scannerPairs: z.number().int().nonnegative(),
  exchanges: z.array(
    z.object({
      name: z.string(),
      status: serviceStatusSchema,
      latencyMs: z.number().nonnegative(),
    }),
  ),
  workers: z.object({
    healthy: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  notifications: serviceStatusSchema,
  lastScanAt: timestampSchema,
});
export type PlatformHealth = z.infer<typeof platformHealthSchema>;

export const dashboardSignalSchema = z.object({
  id: z.string(),
  coin: z.string(),
  pair: z.string(),
  exchange: z.string(),
  direction: signalDirectionSchema,
  /** Contributing strategies — length > 1 means confluence (ADR-021 §1). */
  strategies: z.array(z.string()).min(1),
  confidence: confidenceSchema,
  riskLevel: riskLevelSchema,
  entryPrice: priceSchema,
  generatedAt: timestampSchema,
});
export type DashboardSignal = z.infer<typeof dashboardSignalSchema>;

const strategyScoreSchema = z.object({
  name: z.string(),
  /** Realized expectancy in R. Negative ⇒ the strategy must be disabled. */
  expectancy: z.number(),
  winRate: z.number().min(0).max(100),
});

export const strategyHealthSummarySchema = z.object({
  best: strategyScoreSchema,
  weakest: strategyScoreSchema,
  active: z.number().int().nonnegative(),
  disabled: z.number().int().nonnegative(),
});
export type StrategyHealthSummary = z.infer<typeof strategyHealthSummarySchema>;

export const activityEventSchema = z.object({
  id: z.string(),
  kind: activityKindSchema,
  title: z.string(),
  detail: z.string(),
  occurredAt: timestampSchema,
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const marketOverviewSchema = z.object({
  symbol: z.string(),
  lastPrice: priceSchema,
  changePercent24h: z.number(),
  series: z.array(timeSeriesPointSchema),
});
export type MarketOverview = z.infer<typeof marketOverviewSchema>;
