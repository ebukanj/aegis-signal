import { v4 as uuidv4 } from "uuid";
import type { 
  PortfolioSummary, 
  PaperPosition, 
  PaperTrade, 
  JournalEntry, 
  PortfolioStats, 
  PortfolioChartPoint,
  PortfolioAllocation,
  RiskMetrics,
  TradingCalendarDay
} from "../types";

// Helper: PRNG
function seedPRNG(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

const randState = seedPRNG("aegis-paper-trading-v1");
function random() { return randState() / 4294967296; }
function randomRange(min: number, max: number) { return min + random() * (max - min); }

// --- GENERATORS ---

export function generateMockPortfolioData() {
  const initialCapital = 100000;
  const days = 90;
  const msPerDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const startTime = now - days * msPerDay;

  // 1. Generate Equity Curve
  const chartData: PortfolioChartPoint[] = [];
  let currentEquity = initialCapital;
  
  for (let i = 0; i <= days; i++) {
    const time = startTime + i * msPerDay;
    // Simulate some daily volatility with a slight upward drift
    const dailyReturn = randomRange(-0.015, 0.02); 
    currentEquity = currentEquity * (1 + dailyReturn);
    
    chartData.push({
      time: Math.floor(time / 1000),
      value: currentEquity
    });
  }

  // 2. Generate Active Positions
  const openPositions: PaperPosition[] = [
    {
      id: uuidv4(),
      coin: "BTC",
      direction: "LONG",
      entryPrice: 62450.0,
      currentPrice: 63100.0,
      size: 0.5,
      unrealizedPnL: 325.0,
      unrealizedPnLPct: 1.04,
      stopLoss: 60000.0,
      takeProfit: 68000.0,
      riskAmount: 1225.0,
      durationHours: 14.5,
      strategy: "Chameleon",
      confidence: 88,
      status: "IN_PROFIT",
      aiCommentary: "Momentum is building on the 4H chart. Holding strong."
    },
    {
      id: uuidv4(),
      coin: "ETH",
      direction: "SHORT",
      entryPrice: 3100.0,
      currentPrice: 3150.0,
      size: 10,
      unrealizedPnL: -500.0,
      unrealizedPnLPct: -1.61,
      stopLoss: 3200.0,
      takeProfit: 2800.0,
      riskAmount: 1000.0,
      durationHours: 5.2,
      strategy: "Mean Reversion",
      confidence: 65,
      status: "IN_LOSS",
      aiCommentary: "Approaching stop loss zone. Monitor for potential early exit."
    },
    {
      id: uuidv4(),
      coin: "SOL",
      direction: "LONG",
      entryPrice: 145.0,
      currentPrice: 145.5,
      size: 100,
      unrealizedPnL: 50.0,
      unrealizedPnLPct: 0.34,
      stopLoss: 135.0,
      takeProfit: 165.0,
      riskAmount: 1000.0,
      durationHours: 1.1,
      strategy: "Breakout",
      confidence: 75,
      status: "OPEN",
      aiCommentary: "Trade is developing. Choppy local price action."
    }
  ];

  const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

  // 3. Generate Closed Trades & Journals
  const closedTrades: PaperTrade[] = [];
  const journals: JournalEntry[] = [];
  
  let realizedPnL = 0;
  let winningTrades = 0;
  
  for (let i = 0; i < 50; i++) {
    const isWin = random() > 0.45; // 55% win rate
    const pnlPct = isWin ? randomRange(1, 5) : randomRange(-2, -0.5);
    const pnl = (100000 * 0.01) * pnlPct; // R-based PnL approx
    realizedPnL += pnl;
    if (isWin) winningTrades++;
    
    const tradeTime = now - Math.floor(randomRange(1, days)) * msPerDay;
    const duration = randomRange(1, 48); // hours
    
    const tradeId = uuidv4();
    closedTrades.push({
      id: tradeId,
      coin: ["BTC", "ETH", "SOL", "LINK", "AVAX"][Math.floor(randomRange(0, 5))],
      strategy: ["Chameleon", "Mean Reversion", "Breakout"][Math.floor(randomRange(0, 3))],
      direction: random() > 0.5 ? "LONG" : "SHORT",
      entryPrice: 100, // Dummy
      exitPrice: 105, // Dummy
      entryTime: Math.floor((tradeTime - duration * 3600 * 1000) / 1000),
      exitTime: Math.floor(tradeTime / 1000),
      durationHours: duration,
      realizedPnL: pnl,
      realizedPnLPct: pnlPct,
      returnR: pnlPct, // Simplified
      outcome: isWin ? "WIN" : "LOSS",
      status: "CLOSED"
    });
    
    journals.push({
      tradeId,
      reasonForEntry: isWin ? "Clear confluence on 1H chart with momentum oscillator cross." : "FOMO entry after sudden wick up.",
      strategyUsed: "Chameleon",
      lessonsLearned: isWin ? "Holding to target pays off." : "Don't chase green candles.",
      mistakes: isWin ? [] : ["Chasing price", "Ignored higher timeframe resistance"],
      confidenceBefore: Math.floor(randomRange(6, 10)),
      confidenceAfter: isWin ? Math.floor(randomRange(7, 10)) : Math.floor(randomRange(3, 6)),
      emotionNotes: "Felt anxious during the initial drawdown.",
      tradeRating: Math.floor(randomRange(1, 6)) as 1 | 2 | 3 | 4 | 5,
      tags: ["#momentum", "#1h"],
      notes: "Standard setup."
    });
  }

  // Sort closed trades most recent first
  closedTrades.sort((a, b) => b.exitTime - a.exitTime);

  // 4. Summaries
  const cashBalance = currentEquity - unrealizedPnL;
  const summary: PortfolioSummary = {
    portfolioValue: currentEquity,
    cashBalance,
    unrealizedPnL,
    unrealizedPnLPct: (unrealizedPnL / initialCapital) * 100,
    realizedPnL,
    todayReturn: currentEquity * 0.012,
    todayReturnPct: 1.2,
    weeklyReturnPct: 4.5,
    monthlyReturnPct: 12.3,
    winRate: (winningTrades / 50) * 100,
    activePositionsCount: openPositions.length,
    closedTradesCount: closedTrades.length,
    portfolioRisk: 3.2,
    availableBuyingPower: cashBalance * 0.9,
  };

  const stats: PortfolioStats = {
    totalTrades: 50,
    averageReturnPct: 1.1,
    averageHoldingTimeHours: 14.5,
    averageWinnerPct: 2.8,
    averageLoserPct: -1.2,
    largestWinDollar: 4500,
    largestLossDollar: -2100,
    bestDayDollar: 5200,
    worstDayDollar: -3100,
    profitFactor: 1.85,
    expectancy: 0.45,
    recoveryFactor: 2.1,
    consistencyScore: 82
  };

  const allocation: PortfolioAllocation = {
    byCoin: [
      { label: "BTC", value: 45, color: "hsl(var(--chart-1))" },
      { label: "ETH", value: 30, color: "hsl(var(--chart-2))" },
      { label: "SOL", value: 15, color: "hsl(var(--chart-3))" },
      { label: "Cash", value: 10, color: "hsl(var(--muted))" }
    ],
    byStrategy: [
      { label: "Chameleon", value: 60, color: "hsl(var(--chart-1))" },
      { label: "Mean Reversion", value: 25, color: "hsl(var(--chart-4))" },
      { label: "Breakout", value: 15, color: "hsl(var(--chart-5))" }
    ],
    byExchange: [
      { label: "Binance", value: 100, color: "hsl(var(--chart-1))" }
    ],
    byDirection: [
      { label: "LONG", value: 70, color: "hsl(var(--chart-2))" },
      { label: "SHORT", value: 30, color: "hsl(var(--chart-5))" }
    ]
  };

  const risk: RiskMetrics = {
    portfolioHeat: 3.2,
    currentDrawdown: -1.5,
    maxDrawdown: -8.4,
    riskByStrategy: [
      { label: "Chameleon", value: 2.1 },
      { label: "Mean Reversion", value: 0.8 },
      { label: "Breakout", value: 0.3 }
    ]
  };

  // 5. Calendar Heatmap Data
  const calendarData: TradingCalendarDay[] = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(now - i * msPerDay);
    const dateStr = d.toISOString().split("T")[0];
    const isTradeDay = random() > 0.3;
    calendarData.push({
      date: dateStr,
      pnl: isTradeDay ? randomRange(-500, 1500) : 0,
      trades: isTradeDay ? Math.floor(randomRange(1, 4)) : 0
    });
  }

  return {
    summary,
    chartData,
    openPositions,
    closedTrades,
    journals,
    stats,
    allocation,
    risk,
    calendarData
  };
}

export const mockPortfolioData = generateMockPortfolioData();
