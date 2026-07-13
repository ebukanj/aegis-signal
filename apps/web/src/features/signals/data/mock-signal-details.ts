import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import { mockOpportunities } from "@/features/scanner/data/mock-opportunities";
import type { Opportunity } from "@/features/scanner/types";
import type {
  AICommentary,
  ConfidenceContributor,
  RiskFactor,
  SignalDetail,
  SignalDetailResponse,
  SimilarSignal,
  StrategyExplanationContent,
} from "@/features/signals/types";
import type { RiskLevel, SignalStatus } from "@/types/domain";
import { REGIME_META } from "@/constants/domain";

/**
 * Deterministic signal-detail mock, derived from the scanner opportunity set
 * so the report always matches the row the user clicked.
 * Mock layer only — REMOVED when the API ships; nothing outside
 * `api/signals-api.ts` may import from this file.
 */

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Plain-language narratives, one per strategy (the five in
 * constants/strategies.ts). No jargon without an explanation.
 */
const STRATEGY_NARRATIVES: Record<
  string,
  (opp: Opportunity) => StrategyExplanationContent
> = {
  Breakout: (opp) => ({
    summary: `${opp.pair} spent days coiling inside an unusually tight range, then closed ${opp.direction === "LONG" ? "above" : "below"} the 20-bar boundary on volume 1.5× its average. Breakout trades exactly this: the expansion leg that follows a squeeze — confirmed by a close and by volume, never by a wick.`,
    conditions: [
      "Price closed beyond the 20-bar range boundary (wick breaks do not count)",
      "Breakout candle volume ≥ 1.5× its 20-period average — real participation",
      `RSI in the momentum band (${opp.direction === "LONG" ? "55–75" : "25–45"}) — moving, not blown off`,
    ],
    filters: [
      "Higher-timeframe trend agrees: price on the right side of the 4h 200 EMA",
      "Trend strength (4h ADX) above threshold — not a dead range",
      "Liquidity gate: 24h volume ≥ $50M and spread ≤ 0.05%",
    ],
    confirmations: [
      "Open interest rising on the breakout bar — new money, not short-covering",
      "No major higher-timeframe level within one ATR of entry",
    ],
  }),
  "Trend Pullback": (opp) => ({
    summary: `${opp.coin} is in a confirmed uptrend and just finished an orderly dip on fading volume. Trend Pullback joins strength rather than chasing it, and exits only when the trend structure actually breaks. Spot only: no leverage, no liquidation risk.`,
    conditions: [
      "Daily EMA stack is bullish (21 above 200) and price is above the 200 EMA",
      "Price pulled back into the EMA(21) zone",
      "Momentum turned back up: RSI crossed back above 50",
    ],
    filters: [
      "BTC regime filter passed — BTC itself is above its daily 200 EMA",
      "No token unlock or emission event within 14 days",
    ],
    confirmations: [
      "The pullback happened on declining volume — profit-taking, not distribution",
      "Weekly close still holds above the weekly EMA(21)",
    ],
  }),
  Reversal: (opp) => ({
    summary: `${opp.pair} stretched more than two standard deviations from its mean inside a confirmed range — and then stopped going. Reversal fades that overextension back toward the average, precisely in the conditions where Breakout is switched off.`,
    conditions: [
      "Price pushed beyond the lower Bollinger Band (20)",
      "Z-score at or beyond −2.2 — a statistical stretch, not ordinary noise",
      "Momentum hooked back: RSI crossed back above 30",
    ],
    filters: [
      "Ranging regime confirmed (4h ADX below 20) — Breakout is suppressed here",
      "Liquidity and spread gates passed",
    ],
    confirmations: [
      "Momentum divergence at the extreme — price pushed, the oscillator refused",
      "Volume climax on the final push — exhaustion, not initiative",
    ],
  }),
  "Level Bounce": (opp) => ({
    summary: `A ${opp.direction === "LONG" ? "support" : "resistance"} level on ${opp.pair} has been tested repeatedly and never broken cleanly — and the 15-minute chart just reacted at it again. Level Bounce takes small, tightly-stopped trades off proven levels. The edge is precision, not prediction.`,
    conditions: [
      "Price tagged a level that has held multiple times before",
      "It closed back on the correct side of that level — rejection, not a break",
      "Reaction candle volume ≥ 1.3× average — the level was defended",
    ],
    filters: [
      "The 1h trend agrees with the direction — never catch a falling knife",
      "Spread gate passed — critical at these small target sizes",
    ],
    confirmations: [
      "Order flow shifted at the level in the trade direction",
      "The next level is far enough away to leave room for the target",
    ],
  }),
  "Crowd Squeeze": (opp) => ({
    summary: `The crowd is heavily ${opp.direction === "LONG" ? "short" : "long"} ${opp.pair} — funding is extreme, open interest is bloated — and yet price has stopped rewarding them. When everyone is on one side of the boat, their stops become fuel for the move against them.`,
    conditions: [
      "Funding rate beyond its extreme percentile for this market",
      "Open interest at a 30-period high — leverage is stacked up",
      "Price stopped progressing in the crowd's direction, then broke the EMA(21)",
    ],
    filters: [
      "No event (unlock, listing, verdict) that would justify the positioning",
      "Liquidity and spread gates passed",
    ],
    confirmations: [
      "Long/short account ratio confirms the crowding",
      "Small counter-moves are already triggering outsized reactions",
    ],
  }),
};

const FALLBACK_NARRATIVE = (opp: Opportunity): StrategyExplanationContent => ({
  summary: `${opp.strategies[0]} conditions were satisfied on ${opp.pair} (${opp.timeframe}) and the candidate passed every risk filter before publication.`,
  conditions: ["Strategy entry conditions satisfied on the trading timeframe"],
  filters: ["Liquidity, spread, and regime filters passed"],
  confirmations: ["Independent confirmation checks passed"],
});

const CONTRIBUTOR_NOTES: Record<string, [string, string]> = {
  // [strong note, weak note]
  "Trend Alignment": [
    "Higher-timeframe trend points the same way as this trade",
    "Higher-timeframe trend is mixed — alignment is partial",
  ],
  "Volume Confirmation": [
    "Volume expanded exactly where the strategy needs it",
    "Volume support is present but below the ideal profile",
  ],
  Momentum: [
    "Momentum is accelerating in the trade direction",
    "Momentum is positive but decelerating",
  ],
  "Market Regime": [
    "Current regime historically favors this strategy",
    "Regime is acceptable but not this strategy's best environment",
  ],
  Liquidity: [
    "Order-book depth comfortably supports execution",
    "Liquidity is adequate but thinner than average for this pair",
  ],
  Volatility: [
    "Volatility sits in the strategy's optimal band",
    "Volatility is near the edge of the accepted band",
  ],
  "Strategy Health": [
    "Strategy's recent live performance is above its long-term average",
    "Strategy health is acceptable but below its long-term average",
  ],
};

function buildDetail(opp: Opportunity): SignalDetail {
  const rand = createSeededRandom(hashId(opp.id));
  const sign = opp.direction === "LONG" ? 1 : -1;
  const stopDistance = Math.abs(opp.entryPrice - opp.stopLoss);
  const round = (v: number) =>
    v >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000;

  // TP ladder: 1R, full reward target, stretch target
  const takeProfits = [
    round(opp.entryPrice + sign * stopDistance),
    opp.takeProfit,
    round(opp.entryPrice + sign * stopDistance * (opp.rewardRisk + 1.2)),
  ];

  // Confidence contributors scatter around the overall score
  const confidenceBreakdown: ConfidenceContributor[] = Object.entries(
    CONTRIBUTOR_NOTES,
  ).map(([name, [strong, weak]]) => {
    const score = clamp(opp.confidence + randInt(rand, -14, 10), 35, 99);
    return { name, score, note: score >= opp.confidence - 3 ? strong : weak };
  });

  const riskRatings: RiskLevel[] = ["LOW", "MODERATE", "ELEVATED", "HIGH"];
  const riskIndex = riskRatings.indexOf(opp.riskLevel);
  const nearRisk = () =>
    riskRatings[clamp(riskIndex + randInt(rand, -1, 1), 0, 3)];

  const riskFactors: RiskFactor[] = [
    {
      name: "Liquidity",
      rating: nearRisk(),
      note: "Depth within 0.5% of mid supports the expected position size.",
      available: true,
    },
    {
      name: "Volatility",
      rating: nearRisk(),
      note: "Realized volatility is inside the strategy's accepted band.",
      available: true,
    },
    {
      name: "Spread",
      rating: riskIndex > 1 ? "MODERATE" : "LOW",
      note: "Average spread is a small fraction of the stop distance.",
      available: true,
    },
    {
      name: "Correlation",
      rating: nearRisk(),
      note: "Exposure overlap with other active signals stays under the portfolio limit.",
      available: true,
    },
    {
      name: "Funding",
      rating: "MODERATE",
      note: "Funding-rate risk measurement arrives with live derivatives data.",
      available: false,
    },
    {
      name: "Open Interest",
      rating: "MODERATE",
      note: "Open-interest risk measurement arrives with live derivatives data.",
      available: false,
    },
  ];

  const heatScore = clamp(
    30 + riskIndex * 15 + randInt(rand, -8, 8),
    5,
    95,
  );

  const warnings: string[] = [];
  if (opp.riskLevel === "ELEVATED" || opp.riskLevel === "HIGH") {
    warnings.push(
      `${opp.riskLevel === "HIGH" ? "High" : "Elevated"} risk: stop distance is wider than average for ${opp.coin} — reduce size rather than widening the stop.`,
    );
  }
  if (opp.timeframe === "15m") {
    warnings.push(
      "Short timeframe: this signal decays quickly. Late entries materially change the risk/reward.",
    );
  }
  if (opp.confidence < 70) {
    warnings.push(
      "Confidence below 70: the platform publishes this tier for transparency, but historically these signals carry a lower win rate.",
    );
  }

  // Strategy history — equity curve as cumulative R over ~140 closed trades
  const totalTrades = randInt(rand, 90, 260);
  const winRate = clamp(46 + randInt(rand, 0, 16), 40, 68);
  const expectancy = Math.round((0.05 + rand() * 0.45) * 100) / 100;
  const profitFactor = Math.round((1.15 + rand() * 0.9) * 100) / 100;
  const avgDrawdown = Math.round((4 + rand() * 9) * 10) / 10;
  const avgReturnR = Math.round((0.4 + rand() * 0.8) * 100) / 100;

  const curvePoints = 60;
  const nowSec = Math.floor(Date.now() / 1000);
  let equity = 100;
  const equityCurve = Array.from({ length: curvePoints }, (_, i) => {
    equity += (rand() - 0.42) * 2.2;
    equity = Math.max(equity, 82);
    return {
      time: nowSec - (curvePoints - i) * 86400,
      value: Math.round(equity * 100) / 100,
    };
  });

  const outcomes = ["WIN", "WIN", "WIN", "LOSS", "LOSS", "BREAKEVEN"] as const;
  const coins = ["BTC", "ETH", "SOL", "AVAX", "LINK", "ARB", "OP", "NEAR"];
  const similarSignals: SimilarSignal[] = Array.from({ length: 8 }, (_, i) => {
    const outcome = pick(rand, outcomes);
    const returnR =
      outcome === "WIN"
        ? Math.round((0.8 + rand() * 2.6) * 100) / 100
        : outcome === "LOSS"
          ? -1
          : 0;
    return {
      id: `${opp.id}-hist-${i}`,
      closedAt: new Date(
        Date.now() - randInt(rand, 3, 90) * 86400_000,
      ).toISOString(),
      coin: pick(rand, coins),
      strategy: opp.strategies[0],
      outcome,
      returnR,
      holdingHours: randInt(rand, 4, 96),
      confidence: clamp(opp.confidence + randInt(rand, -12, 8), 50, 97),
    };
  }).sort((a, b) => b.closedAt.localeCompare(a.closedAt));

  const statusPool: SignalStatus[] =
    opp.status === "EXPIRING"
      ? ["ACTIVE", "TRIGGERED"]
      : opp.status === "WATCHLIST"
        ? ["ACTIVE"]
        : ["ACTIVE", "ACTIVE", "TRIGGERED"];

  const estimatedHoldingHours =
    opp.timeframe === "15m"
      ? randInt(rand, 2, 10)
      : opp.timeframe === "1h"
        ? randInt(rand, 8, 36)
        : opp.timeframe === "4h"
          ? randInt(rand, 24, 96)
          : randInt(rand, 72, 240);

  const validityHours =
    opp.timeframe === "15m" ? 4 : opp.timeframe === "1h" ? 12 : 48;

  const narrative = STRATEGY_NARRATIVES[opp.strategies[0]] ?? FALLBACK_NARRATIVE;

  // Confluence (ADR-021): independent agreement is itself measured evidence
  if (opp.strategies.length > 1) {
    confidenceBreakdown.push({
      name: "Strategy Confluence",
      score: clamp(78 + (opp.strategies.length - 1) * 9, 0, 99),
      note: `${opp.strategies.length} independent strategies (${opp.strategies.join(
        ", ",
      )}) reached the same conclusion — historically the strongest signal class.`,
    });
  }

  return {
    id: opp.id,
    coin: opp.coin,
    pair: opp.pair,
    exchange: opp.exchange,
    direction: opp.direction,
    strategies: opp.strategies,
    timeframe: opp.timeframe,
    status: pick(rand, statusPool),
    regime: opp.regime,
    confidence: opp.confidence,
    riskLevel: opp.riskLevel,
    marketType: opp.marketType,
    suggestedLeverage: opp.suggestedLeverage,
    isPrime: opp.isPrime,
    generatedAt: opp.generatedAt,
    expiresAt: new Date(
      new Date(opp.generatedAt).getTime() + validityHours * 3600_000,
    ).toISOString(),

    entryPrice: opp.entryPrice,
    stopLoss: opp.stopLoss,
    takeProfits,
    expectedR: opp.rewardRisk,
    maxRiskPercent:
      Math.round((stopDistance / opp.entryPrice) * 100 * 100) / 100,
    estimatedHoldingHours,
    suggestedRiskPercent: null, // arrives with portfolio settings

    confidenceBreakdown,
    explanation: narrative(opp),
    checklist: [
      { label: "Trend confirmed", passed: true },
      { label: "Volume confirmed", passed: true },
      { label: "Liquidity sufficient", passed: true },
      {
        label: "Market regime compatible",
        passed: opp.regime !== "HIGH_VOLATILITY",
      },
      { label: "Risk acceptable", passed: opp.riskLevel !== "HIGH" },
      { label: "No duplicate exposure", passed: true },
    ],

    riskFactors,
    heatScore,
    warnings,

    strategyStats: {
      winRate,
      avgReturnR,
      avgDrawdown,
      profitFactor,
      expectancy,
      totalTrades,
      equityCurve,
    },
    similarSignals,
  };
}

export function getMockSignalDetail(id: string): SignalDetailResponse | null {
  const index = mockOpportunities.findIndex((opp) => opp.id === id);
  if (index === -1) return null;

  // Neighbors follow scanner rank order
  const byRank = [...mockOpportunities].sort((a, b) => a.rank - b.rank);
  const rankIndex = byRank.findIndex((opp) => opp.id === id);

  return {
    detail: buildDetail(mockOpportunities[index]),
    prevId: rankIndex > 0 ? byRank[rankIndex - 1].id : null,
    nextId: rankIndex < byRank.length - 1 ? byRank[rankIndex + 1].id : null,
  };
}

export function getMockAICommentary(id: string): AICommentary | null {
  const opp = mockOpportunities.find((o) => o.id === id);
  if (!opp) return null;
  const regime = REGIME_META[opp.regime].label.toLowerCase();
  const dirWord = opp.direction === "LONG" ? "upside" : "downside";
  const against = opp.direction === "LONG" ? "selling pressure" : "buying pressure";

  return {
    marketSummary: `The broader market is currently in a ${regime} regime. ${opp.coin} has been trading with ${opp.riskLevel === "LOW" ? "orderly" : "elevated"} volatility on ${opp.exchange}, and derivatives positioning does not show extreme crowding. Conditions are consistent with the environments in which ${opp.strategies[0]} has historically performed near its average.`,
    signalExplanation: `In plain terms: ${opp.strategies.length > 1 ? `${opp.strategies.length} independent strategies (${opp.strategies.join(", ")}) each found` : `the ${opp.strategies[0]} strategy found`} a repeatable pattern on the ${opp.timeframe} chart of ${opp.pair} and every risk gate agreed. The confidence score of ${opp.confidence} reflects measured factors — trend alignment, volume, momentum, regime fit, liquidity, volatility, and strategy health — not an opinion.`,
    scenarios: [
      {
        title: "Base case",
        detail: `Price moves toward the first target with normal ${dirWord} rotation; partial profits at TP1 protect the position while TP2 remains the primary objective.`,
      },
      {
        title: "Slow grind",
        detail: `Price drifts sideways before resolving. Time-based exit matters here: if the signal expires without triggering meaningful movement, standing aside is the statistically better choice.`,
      },
      {
        title: "Invalidation",
        detail: `Aggressive ${against} reclaims the entry zone and closes beyond the stop level. The stop exists precisely for this branch — honoring it caps the loss at one R.`,
      },
    ],
    riskCommentary: `The dominant risk is ${opp.riskLevel === "HIGH" || opp.riskLevel === "ELEVATED" ? "volatility expansion around the entry zone — size down rather than widening the stop" : "an abrupt regime change, which would degrade the assumptions behind this setup"}. Funding and open-interest context will strengthen this assessment once live derivatives data is connected.`,
    invalidations: [
      `A ${opp.timeframe} close beyond the stop level (${opp.direction === "LONG" ? "below" : "above"} it) invalidates the setup structurally, not just financially.`,
      "A sudden regime flip to Risk-Off suspends this strategy class platform-wide.",
      "Liquidity evaporation on the entry exchange voids the execution assumptions.",
    ],
    monitor: [
      "Volume behavior at the first target — exhaustion there favors banking profits early.",
      `${opp.coin} funding rate drift against the position.`,
      "BTC regime stability — most altcoin signals inherit BTC's regime risk.",
    ],
  };
}
