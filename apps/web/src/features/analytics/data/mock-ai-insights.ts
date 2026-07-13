import type { AnalyticsAIInsights } from "../types";

/**
 * MOCK LAYER — static AI-generated analytics insights.
 * No AI integration yet. Replaced by the AI Gateway when it ships.
 */
export const mockAIInsights: AnalyticsAIInsights = {
  headline:
    "Breakout and Trend Pullback are driving returns, but Level Bounce needs attention.",
  bestPerformer: {
    title: "Best Performer: Breakout",
    detail:
      "The adaptive meta-engine delivered the highest net R this period with strong win rates across all regimes. Its regime-adaptive allocation is correctly weighting toward trending markets.",
    tone: "positive",
  },
  largestContributor: {
    title: "Largest Contributor: Trend Pullback",
    detail:
      "Trend Pullback's trend-accumulation approach generated the largest absolute return contribution. Its long-only spot strategy thrived during the two bull market phases, accounting for 28% of total portfolio gains.",
    tone: "positive",
  },
  biggestWeakness: {
    title: "Weakness: Level Bounce on Probation",
    detail:
      "Level Bounce's session-based liquidity strategy underperformed expectations with declining win rates over the last 30 days. Consider reducing allocation until the strategy stabilizes.",
    tone: "negative",
  },
  suggestedImprovements: [
    "Increase allocation to Breakout during transition regimes — it shows consistent edge.",
    "Review Reversal's disabled status — mean reversion may become viable if range-bound conditions persist.",
    "Tighten confidence thresholds for Level Bounce to reduce false positive rate.",
    "Consider adding a correlation-based position limiter — Breakout and Trend Pullback show high overlap.",
  ],
  emergingTrends: [
    "Bullish market phase has extended longer than historical average — watch for regime transition signals.",
    "Short-side strategies (Reversal, Crowd Squeeze) showing improving win rates as volatility increases.",
    "Average signal confidence trending upward across all strategies — model calibration improving.",
  ],
  riskObservations: [
    "Maximum drawdown of −7.2% remains within acceptable limits but was concentrated in a single 3-day period.",
    "Portfolio heat is elevated at 68 — consider reducing exposure across high-correlation strategy pairs.",
    "Exchange concentration: 38% of risk deployed on Binance. Diversify across Bybit and OKX.",
  ],
};
