import type { MarketRegime, SignalDirection, Timeframe } from "@/types/domain";
export type { MarketRegime, SignalDirection, Timeframe };

/**
 * Backtesting Configuration
 */
export interface BacktestConfig {
  strategy: string; // Slug or "ALL" for multi-strategy backtest
  exchange: string; // "Binance", "Bybit", "ALL", etc.
  tradingPairs: string[]; // e.g. ["BTC/USDT", "ETH/USDT"]
  timeframe: Timeframe | "MIXED";
  startDate: string; // ISO format
  endDate: string; // ISO format
  initialCapital: number;
  riskPerTrade: number; // Percentage
  commissionPercent: number;
  slippagePercent: number;
  positionSizing: "FIXED_RISK" | "COMPOUNDING" | "FIXED_SIZE";
  regimeFilters: MarketRegime[]; // Which regimes to include
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  strategy: "chameleon",
  exchange: "ALL",
  tradingPairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
  timeframe: "1h",
  startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  endDate: new Date().toISOString().split("T")[0],
  initialCapital: 100000,
  riskPerTrade: 1.0,
  commissionPercent: 0.04,
  slippagePercent: 0.05,
  positionSizing: "COMPOUNDING",
  regimeFilters: ["TRENDING_BULL", "TRENDING_BEAR", "RANGE", "TRANSITION", "HIGH_VOLATILITY", "RISK_OFF"],
};

export type SimulationPhase = 
  | "IDLE"
  | "PREPARING_DATA"
  | "RUNNING_STRATEGY"
  | "CALCULATING_METRICS"
  | "BUILDING_REPORT"
  | "COMPLETED"
  | "FAILED";

export interface SimulationState {
  phase: SimulationPhase;
  progress: number; // 0 to 100
  message: string;
}

/**
 * Historical Trade Record
 */
export interface BacktestTrade {
  id: string;
  tradeNumber: number;
  date: string; // Entry date (ISO)
  exitDate: string; // Exit date (ISO)
  pair: string;
  direction: SignalDirection;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  pnlDollar: number;
  pnlPercent: number;
  returnR: number;
  holdingHours: number;
  outcome: "WIN" | "LOSS" | "BREAKEVEN";
  status: "CLOSED"; // Simulated trades are always closed
  confidence: number;
  regime: MarketRegime;
  // Detail fields
  signalExplanation: string;
  riskSummary: string;
  strategyNotes: string;
  aiCommentary: string;
}

/**
 * Backtest Results / Report
 */
export interface BacktestPerformanceSummary {
  netProfit: number;
  totalReturnPct: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPct: number;
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  avgRMultiple: number;
  avgHoldingHours: number;
  totalTrades: number;
}

export interface BacktestDrawdownAnalysis {
  maxDrawdownPct: number;
  avgDrawdownPct: number;
  recoveryTimeDays: number;
  worstTradeDollar: number;
  worstWeekPct: number;
  worstMonthPct: number;
}

export interface BacktestResult {
  id: string; // Unique run ID
  timestamp: string; // When run
  config: BacktestConfig;
  summary: BacktestPerformanceSummary;
  equityCurve: { time: number; value: number }[]; // time in Unix seconds, value in dollars
  drawdownCurve: { time: number; value: number }[]; // time in Unix seconds, value in percent
  drawdownAnalysis: BacktestDrawdownAnalysis;
  trades: BacktestTrade[];
  aiInsights: {
    strengths: string[];
    weaknesses: string[];
    bestMarkets: string[];
    optimizationSuggestions: string[];
    riskObservations: string[];
  };
}
