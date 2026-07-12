import { STRATEGY_ROSTER } from "@/constants/strategies";
import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import type { MarketRegime, Timeframe } from "@/types/domain";
import {
  COMPATIBILITY_DIMENSIONS,
  type CompatibilityDimension,
  type StrategyAIInsight,
  type StrategyProfile,
  type StrategyStatus,
} from "@/features/strategies/types";

/**
 * Deterministic mock strategy profiles built from the real roster
 * (constants/strategies.ts ← strategies.md). Mock layer only — removed when
 * the API ships; outside the mock layer, only `api/strategies-api.ts` may
 * import from this file.
 */

const EXCHANGES = ["Binance", "Bybit", "OKX", "Bitget", "KuCoin"];

/** Hand-tuned identity data per strategy so profiles feel authentic. */
const PROFILE_SEEDS: Record<
  string,
  {
    timeframes: Timeframe[];
    compat: Partial<Record<CompatibilityDimension, number>>;
    regimes: MarketRegime[];
    frequency: number; // signals/week
    status?: StrategyStatus;
  }
> = {
  ignition: {
    timeframes: ["1h", "4h"],
    compat: { Breakout: 92, "High Volatility": 78, "Bull Market": 74, "Sideways Market": 22 },
    regimes: ["TRENDING_BULL", "TRENDING_BEAR", "HIGH_VOLATILITY"],
    frequency: 9,
  },
  tidewater: {
    timeframes: ["4h", "1d"],
    compat: { "Bull Market": 95, "Low Volatility": 70, "Bear Market": 8, "Sideways Market": 35 },
    regimes: ["TRENDING_BULL"],
    frequency: 1.5,
  },
  "rubber-band": {
    timeframes: ["1h", "4h"],
    compat: { "Sideways Market": 90, "Mean Reversion": 94, "Bull Market": 45, Breakout: 15 },
    regimes: ["RANGE"],
    frequency: 6,
  },
  sniper: {
    timeframes: ["15m"],
    compat: { "Sideways Market": 72, "Mean Reversion": 76, "High Volatility": 55, "Low Volatility": 60 },
    regimes: ["RANGE", "TRANSITION"],
    frequency: 18,
  },
  oracle: {
    timeframes: ["4h", "1d"],
    compat: { "Bull Market": 80, Breakout: 70, "Bear Market": 50, "High Volatility": 62 },
    regimes: ["TRENDING_BULL", "TRANSITION"],
    frequency: 3,
  },
  flush: {
    timeframes: ["15m", "1h"],
    compat: { "High Volatility": 93, "Mean Reversion": 82, "Low Volatility": 12 },
    regimes: ["HIGH_VOLATILITY", "RISK_OFF"],
    frequency: 2.5,
  },
  "crowded-boat": {
    timeframes: ["4h", "1d"],
    compat: { "Sideways Market": 70, "Mean Reversion": 78, "High Volatility": 66, "Bull Market": 48 },
    regimes: ["RANGE", "TRANSITION", "HIGH_VOLATILITY"],
    frequency: 1.8,
  },
  relay: {
    timeframes: ["1d"],
    compat: { "Bull Market": 88, "Sideways Market": 55, "Bear Market": 30, "Low Volatility": 65 },
    regimes: ["TRENDING_BULL", "RANGE"],
    frequency: 1.2,
  },
  harvest: {
    timeframes: ["1d"],
    compat: { "Sideways Market": 85, "Low Volatility": 80, "Bull Market": 75, "High Volatility": 40 },
    regimes: ["RANGE", "TRENDING_BULL"],
    frequency: 0.8,
    status: "ACTIVE",
  },
  killzone: {
    timeframes: ["15m", "1h"],
    compat: { "High Volatility": 70, "Sideways Market": 66, Breakout: 62, "Low Volatility": 45 },
    regimes: ["RANGE", "HIGH_VOLATILITY", "TRANSITION"],
    frequency: 7,
    status: "PROBATION",
  },
  chameleon: {
    timeframes: ["4h", "1d"],
    compat: {
      "Bull Market": 85,
      "Bear Market": 80,
      "Sideways Market": 82,
      "High Volatility": 78,
      "Low Volatility": 75,
      Breakout: 80,
      "Mean Reversion": 80,
    },
    regimes: [
      "TRENDING_BULL",
      "TRENDING_BEAR",
      "RANGE",
      "TRANSITION",
      "HIGH_VOLATILITY",
      "RISK_OFF",
    ],
    frequency: 4,
  },
};

const MONTHS = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

function buildProfile(slug: string): StrategyProfile {
  const identity = STRATEGY_ROSTER.find((s) => s.slug === slug)!;
  const seedData = PROFILE_SEEDS[slug];
  const rand = createSeededRandom(
    slug.split("").reduce((acc, ch) => acc + ch.charCodeAt(0) * 31, 7),
  );

  // Disabled example: one strategy benched by the health monitor
  const status: StrategyStatus =
    seedData.status ?? (slug === "rubber-band" ? "DISABLED" : "ACTIVE");

  const winRate =
    slug === "sniper" || slug === "harvest"
      ? randInt(rand, 58, 72) // high win rate, small R
      : randInt(rand, 40, 56); // R-multiple driven
  const avgReturnR = Math.round((0.5 + rand() * 1.4) * 100) / 100;
  const expectancy =
    Math.round(
      ((winRate / 100) * avgReturnR - (1 - winRate / 100) * 1) * 100,
    ) / 100;
  const profitFactor = Math.round((1.05 + rand() * 1.15) * 100) / 100;

  const healthScore =
    status === "DISABLED"
      ? randInt(rand, 22, 38)
      : status === "PROBATION"
        ? randInt(rand, 42, 58)
        : randInt(rand, 64, 92);

  const compatibility = Object.fromEntries(
    COMPATIBILITY_DIMENSIONS.map((dim) => [
      dim,
      seedData.compat[dim] ?? randInt(rand, 25, 60),
    ]),
  ) as Record<CompatibilityDimension, number>;

  // Equity curve: daily cumulative R over ~90 days, quality tied to health
  const drift = (healthScore - 45) / 900;
  const nowSec = Math.floor(Date.now() / 1000);
  let equity = 100;
  const equityCurve = Array.from({ length: 90 }, (_, i) => {
    equity *= 1 + drift + (rand() - 0.5) * 0.012;
    return {
      time: nowSec - (90 - i) * 86400,
      value: Math.round(equity * 100) / 100,
    };
  });

  const monthlyReturns = MONTHS.map((_, i) => ({
    time: nowSec - (MONTHS.length - i) * 30 * 86400,
    value:
      Math.round(((rand() - (status === "DISABLED" ? 0.55 : 0.38)) * 14) * 10) /
      10,
  }));

  const totalSignals = Math.round(seedData.frequency * 26); // ~6 months
  const wins = Math.round((totalSignals * winRate) / 100);
  const bestIdx = monthlyReturns.reduce(
    (best, p, i) => (p.value > monthlyReturns[best].value ? i : best),
    0,
  );
  const worstIdx = monthlyReturns.reduce(
    (worst, p, i) => (p.value < monthlyReturns[worst].value ? i : worst),
    0,
  );

  return {
    slug,
    name: identity.name,
    className: identity.className,
    market: identity.market,
    description: identity.objective,
    version: `1.${randInt(rand, 0, 4)}.${randInt(rand, 0, 9)}`,
    status,
    health: {
      score: healthScore,
      reliability: Math.min(99, healthScore + randInt(rand, -8, 10)),
      consistency: Math.min(99, healthScore + randInt(rand, -12, 8)),
      drawdownRisk: Math.max(5, 100 - healthScore + randInt(rand, -10, 10)),
      recoveryStatus:
        healthScore >= 70
          ? "RECOVERED"
          : healthScore >= 45
            ? "RECOVERING"
            : "IN_DRAWDOWN",
      trend:
        healthScore >= 75 ? "IMPROVING" : healthScore >= 50 ? "STABLE" : "DECLINING",
    },
    winRate,
    profitFactor,
    expectancy,
    avgReturnR,
    avgDrawdown: Math.round((3 + rand() * 10) * 10) / 10,
    avgConfidence: randInt(rand, 76, 90),
    signalsPerWeek: seedData.frequency,
    preferredTimeframes: seedData.timeframes,
    supportedExchanges:
      identity.market === "SPOT" ? EXCHANGES.slice(0, 3) : EXCHANGES,
    recommendedRisk:
      identity.market === "SPOT" ? "LOW" : pick(rand, ["LOW", "MODERATE"] as const),
    compatibility,
    equityCurve,
    monthlyReturns,
    historical: {
      totalSignals,
      wins,
      losses: totalSignals - wins,
      avgHoldingHours:
        seedData.timeframes[0] === "15m"
          ? randInt(rand, 1, 4)
          : seedData.timeframes[0] === "1h"
            ? randInt(rand, 6, 24)
            : randInt(rand, 48, 240),
      bestMonth: {
        month: MONTHS[bestIdx],
        returnR: monthlyReturns[bestIdx].value,
      },
      worstMonth: {
        month: MONTHS[worstIdx],
        returnR: monthlyReturns[worstIdx].value,
      },
      largestWinR: Math.round((2 + rand() * 4) * 10) / 10,
      largestLossR: -1,
      longestWinStreak: randInt(rand, 4, 11),
      longestLossStreak: randInt(rand, 3, 7),
    },
    defaultConfig: {
      enabled: status !== "DISABLED",
      riskMultiplier: 1,
      confidenceThreshold: 75,
      allowedExchanges:
        identity.market === "SPOT" ? EXCHANGES.slice(0, 3) : EXCHANGES,
      allowedTimeframes: seedData.timeframes,
      maxConcurrentSignals: slug === "sniper" ? 5 : 3,
      notifyOnSignal: true,
      preferredRegimes: seedData.regimes,
      priority: randInt(rand, 1, 10),
    },
  };
}

export const mockStrategies: StrategyProfile[] = STRATEGY_ROSTER.map((s) =>
  buildProfile(s.slug),
);

export function buildAIInsight(slug: string): StrategyAIInsight | null {
  const profile = mockStrategies.find((s) => s.slug === slug);
  if (!profile) return null;
  const topDims = Object.entries(profile.compatibility)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([dim]) => dim.toLowerCase());
  const weakDim = Object.entries(profile.compatibility).sort(
    (a, b) => a[1] - b[1],
  )[0][0];

  return {
    summary: `${profile.name} (${profile.className.toLowerCase()}) has closed ${profile.historical.totalSignals} signals over the tracked window with a ${profile.winRate}% win rate and ${profile.expectancy >= 0 ? "positive" : "negative"} expectancy of ${profile.expectancy}R. Its edge concentrates in ${topDims.join(" and ")} conditions; the health monitor currently rates it ${profile.health.score}/100 (${profile.health.trend.toLowerCase()}).`,
    strengths: [
      `Strong fit for ${topDims[0]} conditions (${Math.max(...Object.values(profile.compatibility))}/100 compatibility)`,
      `Average winner of ${profile.avgReturnR}R against a strictly capped 1R loss`,
      profile.signalsPerWeek >= 6
        ? "High signal frequency gives the expectancy edge room to compound"
        : "Low frequency keeps it selective — signals carry above-average confidence",
    ],
    weaknesses: [
      `Weak in ${weakDim.toLowerCase()} conditions — the allocator should bench it there`,
      profile.avgDrawdown > 8
        ? `Drawdowns average ${profile.avgDrawdown}% — meaningful capital patience required`
        : "Modest per-trade edge means fees and slippage matter proportionally more",
    ],
    recommendedMarkets: `Best deployed in ${topDims.join(" / ")} regimes on ${profile.supportedExchanges.slice(0, 3).join(", ")}; ${profile.market === "SPOT" ? "spot only — no liquidation risk" : "perpetual futures with risk-capped leverage"}.`,
    currentSuitability: {
      score: profile.health.score,
      note:
        profile.status === "ACTIVE"
          ? "Current regime is compatible — the allocator has this strategy in rotation."
          : profile.status === "PROBATION"
            ? "On probation: recent live expectancy fell below its long-term average. Allocation is reduced until it re-proves itself."
            : "Disabled by the health monitor: rolling expectancy went negative. It will not emit signals until re-validated by backtest and paper trading.",
    },
    suggestedImprovements: [
      "Recalibrate the confidence threshold against the last 50 closed trades",
      "Review filter pass rates — a filter that never rejects is not filtering",
      "Compare live fills against backtest assumptions for slippage drift",
    ],
    potentialRisks: [
      "Regime misclassification would route it into hostile conditions",
      "Crowding: identical public setups degrade as more capital trades them",
      "Data-feed degradation silently weakens entry quality — watch health, not just P&L",
    ],
  };
}
