import type { AnalyticsFilters, AnalyticsReport } from "../types";
import type { AnalyticsAIInsights } from "../types";
import { buildAnalyticsReport } from "../data/build-report";
import { mockAIInsights } from "../data/mock-ai-insights";

/**
 * Analytics data access.
 * Currently simulates the REST API with mock data + realistic latency.
 * When the NestJS Analytics module ships, each function becomes a fetch
 * to its endpoint — signatures and return types stay identical, so no
 * component changes are needed.
 */

const simulate = <T>(data: T, delayMs = 500): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const analyticsApi = {
  /** Full analytics report, filtered by the given parameters. */
  getReport: (filters: AnalyticsFilters): Promise<AnalyticsReport> =>
    simulate(buildAnalyticsReport(filters), 800),

  /** AI-generated analytics insights (static mock). */
  getAIInsights: (): Promise<AnalyticsAIInsights> =>
    simulate(mockAIInsights, 1200),
};
