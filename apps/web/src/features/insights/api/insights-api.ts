import type { InsightsFeed } from "@aegis/contracts";
import { getMockInsights } from "@/features/insights/data/mock-insights";

/**
 * Insights data access. Becomes a fetch when the AI/Intelligence layer ships.
 * The AI layer is a separate, slower service (SOLUTION_ARCHITECTURE §10).
 */

const simulate = <T>(data: T, delayMs: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const insightsApi = {
  getFeed: (): Promise<InsightsFeed> => simulate(getMockInsights(), 700),
};
