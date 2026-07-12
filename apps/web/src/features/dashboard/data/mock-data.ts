import { mockOpportunities } from "@/features/scanner/data/mock-opportunities";
import type {
  ActivityEvent,
  DashboardSignal,
  MarketIntelligence,
  MarketOverview,
  PlatformHealth,
  StrategyHealthSummary,
} from "@/features/dashboard/types";

/**
 * Deterministic mock data for dashboard development.
 * Mock layer only — removed when the API ships; outside the mock layer,
 * only `api/dashboard-api.ts` may import from this file.
 */

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

export const mockMarketIntelligence: MarketIntelligence = {
  regime: "TRENDING_BULL",
  regimeConfidence: 82,
  sentiment: 71,
  sentimentLabel: "Greed",
  riskLevel: "MODERATE",
  riskScore: 46,
  activeOpportunities: 14,
  watchlistCount: 23,
  btcDominance: 54.3,
};

export const mockPlatformHealth: PlatformHealth = {
  scanner: "OPERATIONAL",
  scannerPairs: 412,
  exchanges: [
    { name: "Binance", status: "OPERATIONAL", latencyMs: 42 },
    { name: "Bybit", status: "OPERATIONAL", latencyMs: 61 },
    { name: "OKX", status: "OPERATIONAL", latencyMs: 58 },
    { name: "Bitget", status: "DEGRADED", latencyMs: 240 },
    { name: "KuCoin", status: "OPERATIONAL", latencyMs: 74 },
  ],
  workers: { healthy: 7, total: 8 },
  notifications: "OPERATIONAL",
  lastScanAt: minutesAgo(1),
};

/**
 * Today's PRIME signals (ADR-021), reshaped for the dashboard — the
 * dashboard and scanner must always agree, and rows link to the same
 * Signal Intelligence reports.
 */
export const mockSignals: DashboardSignal[] = mockOpportunities
  .filter((opp) => opp.isPrime)
  .map((opp) => ({
    id: opp.id,
    coin: opp.coin,
    pair: opp.pair,
    exchange: opp.exchange,
    direction: opp.direction,
    strategies: opp.strategies,
    confidence: opp.confidence,
    riskLevel: opp.riskLevel,
    entryPrice: opp.entryPrice,
    generatedAt: opp.generatedAt,
  }));

/** The single highest-ranked prime signal — the dashboard's headline. */
export const mockBestOpportunity =
  mockOpportunities.find((opp) => opp.isPrime) ?? null;

export const mockStrategyHealth: StrategyHealthSummary = {
  best: { name: "Trend Continuation", expectancy: 0.42, winRate: 61.5 },
  weakest: { name: "Volatility Fade", expectancy: -0.08, winRate: 43.2 },
  active: 6,
  disabled: 2,
};

export const mockActivity: ActivityEvent[] = [
  {
    id: "act-901",
    kind: "SIGNAL",
    title: "LONG signal generated — SOL/USDT",
    detail: "Momentum Breakout · confidence 91 · Binance",
    occurredAt: minutesAgo(4),
  },
  {
    id: "act-900",
    kind: "NOTIFICATION",
    title: "Telegram alert delivered",
    detail: "BTC/USDT LONG · 2 channels notified",
    occurredAt: minutesAgo(10),
  },
  {
    id: "act-899",
    kind: "STRATEGY_CHANGE",
    title: "Volatility Fade downgraded",
    detail: "Expectancy fell below threshold — allocation reduced",
    occurredAt: minutesAgo(47),
  },
  {
    id: "act-898",
    kind: "SYSTEM",
    title: "Bitget latency degraded",
    detail: "Median REST latency 240ms — monitoring",
    occurredAt: minutesAgo(64),
  },
  {
    id: "act-897",
    kind: "SIGNAL",
    title: "SHORT signal expired — DOGE/USDT",
    detail: "Range Reversal · entry window closed unfilled",
    occurredAt: minutesAgo(92),
  },
  {
    id: "act-896",
    kind: "SYSTEM",
    title: "Market regime confirmed: Trending Bull",
    detail: "Regime engine confidence 82 across 3 timeframes",
    occurredAt: minutesAgo(118),
  },
];

/** Deterministic pseudo-random walk (mulberry32) — same series every load. */
function seededSeries(seed: number, points: number, start: number) {
  let state = seed;
  const rand = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const series = [];
  let value = start;
  const nowSec = Math.floor(now / 1000);
  for (let i = points - 1; i >= 0; i--) {
    value *= 1 + (rand() - 0.475) * 0.006;
    series.push({ time: nowSec - i * 1800, value: Math.round(value * 100) / 100 });
  }
  return series;
}

const btcSeries = seededSeries(42, 96, 94300);

export const mockMarketOverview: MarketOverview = {
  symbol: "BTC/USDT",
  lastPrice: btcSeries[btcSeries.length - 1].value,
  changePercent24h:
    Math.round(
      (btcSeries[btcSeries.length - 1].value / btcSeries[btcSeries.length - 49].value - 1) *
        1000 * 100,
    ) / 1000,
  series: btcSeries,
};
