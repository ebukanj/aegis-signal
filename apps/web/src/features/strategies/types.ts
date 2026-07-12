import type { AreaChartPoint } from "@/components/shared/charts/area-chart";
import type { StrategyMarket } from "@/constants/strategies";
import type { MarketRegime, RiskLevel, Timeframe } from "@/types/domain";

/**
 * Strategy Laboratory view models — DTO-shaped; only `api/strategies-api.ts`
 * changes when the backend ships.
 */

export type StrategyStatus = "ACTIVE" | "PROBATION" | "DISABLED";

/** Market conditions rated for compatibility (0–100). */
export const COMPATIBILITY_DIMENSIONS = [
  "Bull Market",
  "Bear Market",
  "Sideways Market",
  "High Volatility",
  "Low Volatility",
  "Breakout",
  "Mean Reversion",
] as const;
export type CompatibilityDimension = (typeof COMPATIBILITY_DIMENSIONS)[number];

export interface StrategyHealth {
  /** 0–100 composite. */
  score: number;
  reliability: number; // 0–100
  consistency: number; // 0–100
  drawdownRisk: number; // 0–100 (higher = riskier)
  recoveryStatus: "RECOVERED" | "RECOVERING" | "IN_DRAWDOWN";
  trend: "IMPROVING" | "STABLE" | "DECLINING";
}

export interface StrategyHistoricalStats {
  totalSignals: number;
  wins: number;
  losses: number;
  avgHoldingHours: number;
  bestMonth: { month: string; returnR: number };
  worstMonth: { month: string; returnR: number };
  largestWinR: number;
  largestLossR: number;
  longestWinStreak: number;
  longestLossStreak: number;
}

export interface StrategyConfig {
  enabled: boolean;
  riskMultiplier: number; // 0.25–2.0
  confidenceThreshold: number; // 0–100
  allowedExchanges: string[];
  allowedTimeframes: Timeframe[];
  maxConcurrentSignals: number;
  notifyOnSignal: boolean;
  preferredRegimes: MarketRegime[];
  /** 1 (highest) – 10. */
  priority: number;
}

export interface StrategyAIInsight {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendedMarkets: string;
  currentSuitability: { score: number; note: string };
  suggestedImprovements: string[];
  potentialRisks: string[];
}

export interface StrategyProfile {
  slug: string;
  name: string;
  className: string;
  market: StrategyMarket;
  description: string;
  version: string;
  status: StrategyStatus;
  health: StrategyHealth;

  // Headline performance
  winRate: number; // percent
  profitFactor: number;
  expectancy: number; // R
  avgReturnR: number;
  avgDrawdown: number; // percent
  avgConfidence: number; // 0–100
  signalsPerWeek: number;

  // Profile
  preferredTimeframes: Timeframe[];
  supportedExchanges: string[];
  recommendedRisk: RiskLevel;
  compatibility: Record<CompatibilityDimension, number>;

  // Series
  equityCurve: AreaChartPoint[];
  monthlyReturns: { time: number; value: number }[]; // R per month

  historical: StrategyHistoricalStats;
  defaultConfig: StrategyConfig;
}
