import type { MarketRegime, SignalDirection, Timeframe } from "@/types/domain";

export interface PortfolioSummary {
  portfolioValue: number;
  cashBalance: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  realizedPnL: number;
  todayReturn: number;
  todayReturnPct: number;
  weeklyReturnPct: number;
  monthlyReturnPct: number;
  winRate: number;
  activePositionsCount: number;
  closedTradesCount: number;
  portfolioRisk: number; // Percent of portfolio currently at risk
  availableBuyingPower: number;
}

export interface PaperPosition {
  id: string;
  coin: string;
  direction: SignalDirection;
  entryPrice: number;
  currentPrice: number;
  size: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number; // Dollar amount at risk
  durationHours: number;
  strategy: string;
  confidence: number;
  status: "OPEN" | "IN_PROFIT" | "IN_LOSS" | "NEAR_STOP" | "NEAR_TARGET";
  aiCommentary: string;
}

export interface PaperTrade {
  id: string;
  coin: string;
  strategy: string;
  direction: SignalDirection;
  entryPrice: number;
  exitPrice: number;
  entryTime: number; // unix timestamp
  exitTime: number; // unix timestamp
  durationHours: number;
  realizedPnL: number;
  realizedPnLPct: number;
  returnR: number;
  outcome: "WIN" | "LOSS" | "BREAK_EVEN";
  status: "CLOSED";
}

export interface JournalEntry {
  tradeId: string;
  reasonForEntry: string;
  strategyUsed: string;
  lessonsLearned: string;
  mistakes: string[];
  confidenceBefore: number; // 1-10
  confidenceAfter: number; // 1-10
  emotionNotes: string;
  tradeRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  notes: string;
}

export interface PortfolioStats {
  totalTrades: number;
  averageReturnPct: number;
  averageHoldingTimeHours: number;
  averageWinnerPct: number;
  averageLoserPct: number;
  largestWinDollar: number;
  largestLossDollar: number;
  bestDayDollar: number;
  worstDayDollar: number;
  profitFactor: number;
  expectancy: number; // R-multiple expectancy
  recoveryFactor: number;
  consistencyScore: number; // 0-100
}

export interface PortfolioChartPoint {
  time: number; // unix timestamp
  value: number; // Portfolio value
}

export interface PortfolioAllocation {
  byCoin: { label: string; value: number; color: string }[];
  byStrategy: { label: string; value: number; color: string }[];
  byExchange: { label: string; value: number; color: string }[];
  byDirection: { label: string; value: number; color: string }[];
}

export interface RiskMetrics {
  portfolioHeat: number; // 0-100% total risk exposure
  currentDrawdown: number;
  maxDrawdown: number;
  riskByStrategy: { label: string; value: number }[];
}

export interface TradingCalendarDay {
  date: string; // YYYY-MM-DD
  pnl: number;
  trades: number;
}
