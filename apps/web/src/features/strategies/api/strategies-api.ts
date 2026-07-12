import {
  buildAIInsight,
  mockStrategies,
} from "@/features/strategies/data/mock-strategies";
import type {
  StrategyAIInsight,
  StrategyProfile,
} from "@/features/strategies/types";

/**
 * Strategy Laboratory data access. Simulates the REST API with mock data +
 * latency; each function becomes a fetch when the backend ships.
 */

const simulate = <T>(data: T, delayMs: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const strategiesApi = {
  getStrategies: (): Promise<StrategyProfile[]> =>
    simulate(mockStrategies, 550),

  getAIInsight: (slug: string): Promise<StrategyAIInsight> => {
    const insight = buildAIInsight(slug);
    if (!insight) return Promise.reject(new Error(`Strategy ${slug} not found`));
    return simulate(insight, 1200);
  },
};
