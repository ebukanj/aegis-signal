import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import {
  BUILT_IN_STRATEGIES,
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

/**
 * Liquid majors that genuinely list on the exchanges below, in both spot and
 * perpetual. This is not cosmetic: the chart resolves a real TradingView symbol
 * from `{exchange}:{coin}USDT`, so an invented pairing renders "this symbol
 * doesn't exist" — a broken chart on a signal that otherwise looks authoritative.
 *
 * MATIC was removed: it no longer exists. Polygon migrated to POL, and
 * BINANCE:MATICUSDT is gone. Mock data must lie about *values*, never about
 * *reality* — a coin that does not exist is not a placeholder, it is a bug
 * waiting to reach a trader.
 */
/*
 * THE PRICE IS NOW REAL, AND THESE ENTRIES MUST LIVE NEAR IT.
 *
 * `useLivePrice` no longer invents a number — it streams the actual Binance
 * perpetual price. So a mock entry of $97,800 against a real BTC at $62,700
 * renders every signal as "Invalidated: price already reached the stop". The
 * signals would be fabricated AND look broken.
 *
 * These are anchored to the real perpetual prices as of 2026-07-14. They will
 * drift, and that is tolerable: the entry only has to be in the right
 * neighbourhood for the "at entry / chasing / missed" verdict to mean anything.
 *
 * The whole table dies with the Signal module, when signals come from the Risk
 * Engine and carry entries the platform actually chose.
 *
 * TON was removed: Binance lists no TON perpetual, and the Symbol Registry
 * refused to invent one. Mock data may lie about *values*; it must never lie
 * about *reality* — a market that does not exist is not a placeholder, it is a
 * bug waiting to reach a trader.
 */
const COINS: { coin: string; basePrice: number }[] = [
  { coin: "BTC", basePrice: 62728 },
  { coin: "ETH", basePrice: 1793 },
  { coin: "SOL", basePrice: 75.2 },
  { coin: "BNB", basePrice: 570 },
  { coin: "XRP", basePrice: 1.069 },
  { coin: "ADA", basePrice: 0.1586 },
  { coin: "AVAX", basePrice: 6.48 },
  { coin: "DOGE", basePrice: 0.0722 },
  { coin: "LINK", basePrice: 7.94 },
  { coin: "ARB", basePrice: 0.089 },
  { coin: "OP", basePrice: 0.0997 },
  { coin: "DOT", basePrice: 0.841 },
  { coin: "ATOM", basePrice: 1.522 },
  { coin: "NEAR", basePrice: 1.985 },
  { coin: "APT", basePrice: 0.6015 },
  { coin: "SUI", basePrice: 0.7303 },
  { coin: "LTC", basePrice: 43.67 },
  { coin: "INJ", basePrice: 5.026 },
];

/**
 * Venues that list every coin above, spot and perp, and that TradingView covers.
 *
 * Bitget and KuCoin were dropped from the mock for exactly that reason — the
 * generator was pairing coins with exchanges at random and inventing listings
 * that do not exist. When the backend ships, the exchange comes from the venue
 * the signal was actually found on, and this list disappears.
 */
const EXCHANGES = ["Binance", "Bybit", "OKX"] as const;
/** Real roster (constants/strategies.ts) — directional strategies only. */
const STRATEGIES = BUILT_IN_STRATEGIES.map((s) => s.name);
const SPOT_ONLY = new Set(SPOT_ONLY_STRATEGY_NAMES);
const FUTURES_STRATEGIES = BUILT_IN_STRATEGIES.filter(
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
