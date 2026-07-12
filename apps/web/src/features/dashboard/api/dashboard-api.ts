import {
  mockActivity,
  mockBestOpportunity,
  mockMarketIntelligence,
  mockMarketOverview,
  mockPlatformHealth,
  mockSignals,
  mockStrategyHealth,
} from "@/features/dashboard/data/mock-data";
import type {
  ActivityEvent,
  DashboardSignal,
  MarketIntelligence,
  MarketOverview,
  PlatformHealth,
  StrategyHealthSummary,
} from "@/features/dashboard/types";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Dashboard data access.
 * Currently simulates the REST API with mock data + realistic latency.
 * When the NestJS API ships, each function becomes a fetch to its endpoint —
 * signatures and return types stay identical, so no component changes.
 */

const simulate = <T>(data: T, delayMs = 500): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const dashboardApi = {
  getMarketIntelligence: (): Promise<MarketIntelligence> =>
    simulate(mockMarketIntelligence, 450),

  getPlatformHealth: (): Promise<PlatformHealth> =>
    simulate(mockPlatformHealth, 600),

  getHighConfidenceSignals: (): Promise<DashboardSignal[]> =>
    simulate(mockSignals, 700),

  /** The single best current opportunity (highest-ranked prime signal). */
  getBestOpportunity: (): Promise<Opportunity | null> =>
    simulate(mockBestOpportunity, 500),

  getStrategyHealth: (): Promise<StrategyHealthSummary> =>
    simulate(mockStrategyHealth, 550),

  getRecentActivity: (): Promise<ActivityEvent[]> =>
    simulate(mockActivity, 650),

  getMarketOverview: (): Promise<MarketOverview> =>
    simulate(mockMarketOverview, 800),
};
