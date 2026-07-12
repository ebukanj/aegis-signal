import type { AnalyticsAIInsights } from "../types";

/**
 * MOCK LAYER — static AI-generated analytics insights.
 * No AI integration yet. Replaced by the AI Gateway when it ships.
 */
export const mockAIInsights: AnalyticsAIInsights = {
  headline:
    "Chameleon and Tidewater are driving returns, but Killzone needs attention.",
  bestPerformer: {
    title: "Best Performer: Chameleon",
    detail:
      "The adaptive meta-engine delivered the highest net R this period with strong win rates across all regimes. Its regime-adaptive allocation is correctly weighting toward trending markets.",
    tone: "positive",
  },
  largestContributor: {
    title: "Largest Contributor: Tidewater",
    detail:
      "Tidewater's trend-accumulation approach generated the largest absolute return contribution. Its long-only spot strategy thrived during the two bull market phases, accounting for 28% of total portfolio gains.",
    tone: "positive",
  },
  biggestWeakness: {
    title: "Weakness: Killzone on Probation",
    detail:
      "Killzone's session-based liquidity strategy underperformed expectations with declining win rates over the last 30 days. Consider reducing allocation until the strategy stabilizes.",
    tone: "negative",
  },
  suggestedImprovements: [
    "Increase allocation to Chameleon during transition regimes — it shows consistent edge.",
    "Review Rubber Band's disabled status — mean reversion may become viable if range-bound conditions persist.",
    "Tighten confidence thresholds for Killzone to reduce false positive rate.",
    "Consider adding a correlation-based position limiter — Ignition and Oracle show high overlap.",
  ],
  emergingTrends: [
    "Bullish market phase has extended longer than historical average — watch for regime transition signals.",
    "Short-side strategies (Flush, Crowded Boat) showing improving win rates as volatility increases.",
    "Average signal confidence trending upward across all strategies — model calibration improving.",
  ],
  riskObservations: [
    "Maximum drawdown of −7.2% remains within acceptable limits but was concentrated in a single 3-day period.",
    "Portfolio heat is elevated at 68 — consider reducing exposure across high-correlation strategy pairs.",
    "Exchange concentration: 38% of risk deployed on Binance. Diversify across Bybit and OKX.",
  ],
};
