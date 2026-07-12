import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import {
  DIRECTIONAL_STRATEGIES,
  SPOT_ONLY_STRATEGY_NAMES,
} from "@/constants/strategies";
import type {
  MarketRegime,
  MarketType,
  OpportunityStatus,
  RiskLevel,
  SignalDirection,
  Timeframe,
} from "@/types/domain";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Deterministic mock opportunities for scanner development.
 * Mock layer only — removed when the API ships; outside the mock layer,
 * only `api/scanner-api.ts` (and toolbar filter options) may import it.
 */

const COINS: { coin: string; basePrice: number }[] = [
  { coin: "BTC", basePrice: 97800 },
  { coin: "ETH", basePrice: 3410 },
  { coin: "SOL", basePrice: 168 },
  { coin: "BNB", basePrice: 615 },
  { coin: "XRP", basePrice: 2.32 },
  { coin: "ADA", basePrice: 0.92 },
  { coin: "AVAX", basePrice: 41.8 },
  { coin: "DOGE", basePrice: 0.31 },
  { coin: "LINK", basePrice: 21.4 },
  { coin: "ARB", basePrice: 0.91 },
  { coin: "OP", basePrice: 1.84 },
  { coin: "MATIC", basePrice: 0.52 },
  { coin: "DOT", basePrice: 6.85 },
  { coin: "ATOM", basePrice: 6.12 },
  { coin: "NEAR", basePrice: 4.95 },
  { coin: "APT", basePrice: 8.6 },
  { coin: "SUI", basePrice: 3.42 },
  { coin: "TON", basePrice: 5.15 },
  { coin: "LTC", basePrice: 104 },
  { coin: "INJ", basePrice: 22.3 },
];

const EXCHANGES = ["Binance", "Bybit", "OKX", "Bitget", "KuCoin"] as const;
/** Real roster (constants/strategies.ts) — directional strategies only. */
const STRATEGIES = DIRECTIONAL_STRATEGIES.map((s) => s.name);
const SPOT_ONLY = new Set(SPOT_ONLY_STRATEGY_NAMES);
const FUTURES_STRATEGIES = DIRECTIONAL_STRATEGIES.filter(
  (s) => s.market !== "SPOT",
).map((s) => s.name);
const REGIMES: MarketRegime[] = [
  "TRENDING_BULL",
  "TRENDING_BEAR",
  "RANGE",
  "TRANSITION",
  "HIGH_VOLATILITY",
];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];
const RISKS: RiskLevel[] = ["LOW", "MODERATE", "ELEVATED", "HIGH"];

/** Mirrors the Risk Engine's leverage caps (docs/BACKEND_NOTES.md). */
const LEVERAGE_BY_RISK: Record<RiskLevel, number[]> = {
  LOW: [10, 20],
  MODERATE: [5, 10],
  ELEVATED: [3, 5],
  HIGH: [2, 3],
};

function buildOpportunities(count: number): Opportunity[] {
  const rand = createSeededRandom(1337);
  const now = Date.now();

  const rows: Opportunity[] = Array.from({ length: count }, (_, index) => {
    const { coin, basePrice } = pick(rand, COINS);
    const direction: SignalDirection = rand() < 0.58 ? "LONG" : "SHORT";
    const status: OpportunityStatus =
      rand() < 0.62 ? "ACTIVE" : rand() < 0.7 ? "WATCHLIST" : "EXPIRING";
    const riskLevel = pick(rand, RISKS);
    const timeframe = pick(rand, TIMEFRAMES);

    // Confluence (ADR-021): ~1/3 of signals are confirmed by a second
    // independent strategy, a few by a third — with a bounded uplift.
    // Confluence partners share the primary's market universe.
    const primary = pick(rand, STRATEGIES);
    const partnerPool = SPOT_ONLY.has(primary) ? STRATEGIES : FUTURES_STRATEGIES;
    const strategies: string[] = [primary];
    if (rand() < 0.35) {
      const second = pick(rand, partnerPool);
      if (!strategies.includes(second)) strategies.push(second);
      if (rand() < 0.22) {
        const third = pick(rand, partnerPool);
        if (!strategies.includes(third)) strategies.push(third);
      }
    }
    const confidence = Math.min(
      97,
      randInt(rand, 52, 92) + (strategies.length - 1) * 4,
    );

    // Execution guidance (Risk Engine domain — mock mirrors its rules):
    // spot-only strategies emit LONG spot; SHORT is always PERPETUAL
    const isSpotStrategy = strategies.some((s) => SPOT_ONLY.has(s));
    const effectiveDirection: SignalDirection = isSpotStrategy
      ? "LONG"
      : direction;
    const marketType: MarketType = isSpotStrategy
      ? "SPOT"
      : effectiveDirection === "LONG" && (timeframe === "1d" || rand() < 0.12)
        ? "SPOT"
        : "PERPETUAL";
    const suggestedLeverage =
      marketType === "PERPETUAL" ? pick(rand, LEVERAGE_BY_RISK[riskLevel]) : null;

    const entry = basePrice * (1 + (rand() - 0.5) * 0.04);
    const stopDistance = entry * (0.008 + rand() * 0.03);
    const rewardRisk = Math.round((1.2 + rand() * 2.6) * 10) / 10;
    const sign = effectiveDirection === "LONG" ? 1 : -1;
    const round = (v: number) =>
      v >= 100 ? Math.round(v * 100) / 100 : Math.round(v * 10000) / 10000;

    return {
      id: `opp-${2000 + index}`,
      rank: 0, // assigned after sorting by quality below
      coin,
      pair: `${coin}/USDT`,
      exchange: pick(rand, EXCHANGES),
      direction: effectiveDirection,
      strategies,
      timeframe,
      confidence,
      riskLevel,
      marketType,
      suggestedLeverage,
      isPrime: false, // awarded after ranking below
      entryPrice: round(entry),
      stopLoss: round(entry - sign * stopDistance),
      takeProfit: round(entry + sign * stopDistance * rewardRisk),
      rewardRisk,
      regime: pick(rand, REGIMES),
      status,
      generatedAt: new Date(now - randInt(rand, 2, 360) * 60_000).toISOString(),
    };
  });

  // Rank by expected quality: confidence first, then reward/risk
  rows.sort(
    (a, b) => b.confidence - a.confidence || b.rewardRisk - a.rewardRisk,
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  // Prime budget (ADR-021): top 5 active signals clearing the confidence floor
  rows
    .filter((row) => row.confidence >= 88 && row.status !== "WATCHLIST")
    .slice(0, 5)
    .forEach((row) => {
      row.isPrime = true;
    });

  return rows;
}

export const mockOpportunities: Opportunity[] = buildOpportunities(60);

export const scannerFilterOptions = {
  exchanges: [...EXCHANGES],
  strategies: [...STRATEGIES],
  timeframes: TIMEFRAMES,
};
