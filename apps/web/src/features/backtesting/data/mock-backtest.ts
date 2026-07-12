import type { BacktestConfig, BacktestResult, BacktestTrade, MarketRegime } from "../types";
import { v4 as uuidv4 } from "uuid";

/**
 * Deterministic PRNG to generate reproducible backtests based on config.
 */
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function randomItem<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

/**
 * Generate a realistic backtest result dynamically based on the configuration.
 */
export function generateMockBacktest(config: BacktestConfig): BacktestResult {
  const seed = config.strategy.length + config.initialCapital + config.riskPerTrade;
  let currentSeed = seed;

  const startDate = new Date(config.startDate);
  const endDate = new Date(config.endDate);
  const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Generate Trades
  const trades: BacktestTrade[] = [];
  
  // Strategy characteristics
  const baseWinRate = config.strategy === "chameleon" ? 0.65 : config.strategy === "oracle" ? 0.55 : 0.60;
  const baseAvgR = config.strategy === "chameleon" ? 1.2 : config.strategy === "oracle" ? 2.5 : 1.5;
  const tradesPerDay = config.timeframe === "15m" ? 4 : config.timeframe === "1h" ? 1.5 : 0.5;
  
  const totalTradesToGenerate = Math.floor(days * tradesPerDay);
  
  let currentEquity = config.initialCapital;
  let peakEquity = currentEquity;
  let maxDrawdownPct = 0;
  let maxDrawdownDollar = 0;

  const equityCurve: { time: number; value: number }[] = [];
  const drawdownCurve: { time: number; value: number }[] = [];

  // Initial points
  equityCurve.push({ time: Math.floor(startDate.getTime() / 1000), value: currentEquity });
  drawdownCurve.push({ time: Math.floor(startDate.getTime() / 1000), value: 0 });

  const regimes: MarketRegime[] = ["TRENDING_BULL", "TRENDING_BEAR", "RANGE", "TRANSITION", "HIGH_VOLATILITY", "RISK_OFF"];

  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalHoldingHours = 0;

  // Distribute trades over the timeline
  for (let i = 0; i < totalTradesToGenerate; i++) {
    currentSeed++;
    
    // Calculate trade date
    const tradeDate = new Date(startDate.getTime() + (i / totalTradesToGenerate) * (days * 24 * 60 * 60 * 1000));
    const isWin = seededRandom(currentSeed) < baseWinRate;
    
    // Simulate R-multiple return
    let returnR = 0;
    if (isWin) {
      returnR = baseAvgR * (0.5 + seededRandom(currentSeed + 1)); // 0.5x to 1.5x of average
      wins++;
    } else {
      returnR = -1.0 * (0.8 + seededRandom(currentSeed + 1) * 0.4); // -0.8R to -1.2R
      losses++;
    }

    const holdingHours = (config.timeframe === "15m" ? 2 : config.timeframe === "1h" ? 12 : 48) * (0.5 + seededRandom(currentSeed + 2));
    totalHoldingHours += holdingHours;

    const exitDate = new Date(tradeDate.getTime() + holdingHours * 60 * 60 * 1000);

    // Calculate PnL based on position sizing
    let riskDollar = 0;
    if (config.positionSizing === "COMPOUNDING") {
      riskDollar = currentEquity * (config.riskPerTrade / 100);
    } else {
      riskDollar = config.initialCapital * (config.riskPerTrade / 100);
    }

    const pnlDollar = riskDollar * returnR - (riskDollar * config.commissionPercent / 100 * 2) - (riskDollar * config.slippagePercent / 100 * 2);
    
    if (pnlDollar > 0) grossProfit += pnlDollar;
    else grossLoss += Math.abs(pnlDollar);

    currentEquity += pnlDollar;

    // Track Drawdown
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDrawdownPct = peakEquity === 0 ? 0 : ((currentEquity - peakEquity) / peakEquity) * 100;
    if (currentDrawdownPct < maxDrawdownPct) maxDrawdownPct = currentDrawdownPct;
    
    const currentDrawdownDollar = peakEquity - currentEquity;
    if (currentDrawdownDollar > maxDrawdownDollar) maxDrawdownDollar = currentDrawdownDollar;

    const trade: BacktestTrade = {
      id: uuidv4(),
      tradeNumber: i + 1,
      date: tradeDate.toISOString(),
      exitDate: exitDate.toISOString(),
      pair: randomItem(config.tradingPairs, currentSeed + 3),
      direction: seededRandom(currentSeed + 4) > 0.5 ? "LONG" : "SHORT",
      strategy: config.strategy === "ALL" ? "chameleon" : config.strategy,
      entryPrice: 50000 * (0.8 + seededRandom(currentSeed + 5) * 0.4),
      exitPrice: 0, // Calculated below
      pnlDollar,
      pnlPercent: (pnlDollar / currentEquity) * 100,
      returnR,
      holdingHours,
      outcome: pnlDollar > 0 ? "WIN" : "LOSS",
      status: "CLOSED",
      confidence: 65 + Math.floor(seededRandom(currentSeed + 6) * 35),
      regime: randomItem(regimes, currentSeed + 7),
      signalExplanation: "Momentum breakout confirmed by volume expansion across multiple timeframes.",
      riskSummary: `Risked ${config.riskPerTrade}% with stop below local swing low.`,
      strategyNotes: "Executed according to standard rules, no manual intervention.",
      aiCommentary: pnlDollar > 0 
        ? "Excellent entry timing. The setup aligned perfectly with the broader market regime."
        : "Early entry into a false breakout. Consider waiting for a deeper retracement in this regime.",
    };

    trade.exitPrice = trade.direction === "LONG" 
      ? trade.entryPrice * (1 + (pnlDollar / riskDollar) * 0.01) // mock calc
      : trade.entryPrice * (1 - (pnlDollar / riskDollar) * 0.01);

    trades.push(trade);

    // Only add curve points every few trades to keep charts clean, or end of day
    if (i % Math.ceil(tradesPerDay) === 0 || i === totalTradesToGenerate - 1) {
      equityCurve.push({ time: Math.floor(exitDate.getTime() / 1000), value: currentEquity });
      drawdownCurve.push({ time: Math.floor(exitDate.getTime() / 1000), value: currentDrawdownPct });
    }
  }

  // Calculate Summaries
  const totalReturnPct = ((currentEquity - config.initialCapital) / config.initialCapital) * 100;
  const winRate = wins / (wins + losses) * 100;
  const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
  const netProfit = currentEquity - config.initialCapital;
  
  const avgRMultiple = trades.filter(t => t.outcome === "WIN").reduce((s, t) => s + t.returnR, 0) / (wins || 1);
  const expectancyR = trades.reduce((s, t) => s + t.returnR, 0) / (trades.length || 1);

  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    config,
    summary: {
      netProfit,
      totalReturnPct,
      profitFactor,
      expectancyR,
      maxDrawdownPct,
      winRate,
      sharpeRatio: 1.8 + seededRandom(seed) * 1.5, // Mock Sharpe
      sortinoRatio: 2.2 + seededRandom(seed + 1) * 2.0, // Mock Sortino
      calmarRatio: (totalReturnPct / Math.max(1, Math.abs(maxDrawdownPct))) * (365 / days), // Annualized approx
      avgRMultiple,
      avgHoldingHours: totalHoldingHours / (trades.length || 1),
      totalTrades: trades.length,
    },
    equityCurve,
    drawdownCurve,
    drawdownAnalysis: {
      maxDrawdownPct,
      avgDrawdownPct: maxDrawdownPct * 0.4,
      recoveryTimeDays: Math.floor(days * 0.15), // Mock
      worstTradeDollar: maxDrawdownDollar * 0.2, // Mock
      worstWeekPct: maxDrawdownPct * 0.6,
      worstMonthPct: maxDrawdownPct * 0.8,
    },
    trades: trades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), // Newest first
    aiInsights: {
      strengths: [
        "Consistent performance during high volatility periods.",
        "Drawdowns are kept shallow relative to total return.",
        "Win rate remains stable across major currency pairs."
      ],
      weaknesses: [
        "Underperforms significantly during choppy, sideways markets.",
        "Average holding time stretches uncomfortably long during trend pauses."
      ],
      bestMarkets: ["TRENDING_BULL", "HIGH_VOLATILITY"],
      optimizationSuggestions: [
        "Consider implementing a trailing stop once 1.5R is achieved to protect profits.",
        "Reduce position sizing by 50% when regime shifts to RANGE."
      ],
      riskObservations: [
        `Maximum drawdown of ${Math.abs(maxDrawdownPct).toFixed(1)}% occurred during a sudden volatility spike.`,
        "Consecutive losing streaks reached a maximum of 4 trades."
      ],
    }
  };
}
