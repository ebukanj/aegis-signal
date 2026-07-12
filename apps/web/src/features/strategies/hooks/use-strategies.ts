"use client";

import { useQuery } from "@tanstack/react-query";
import { strategiesApi } from "@/features/strategies/api/strategies-api";

export const strategyKeys = {
  list: ["strategies", "list"] as const,
  aiInsight: (slug: string) => ["strategies", "ai-insight", slug] as const,
};

export function useStrategies() {
  return useQuery({
    queryKey: strategyKeys.list,
    queryFn: strategiesApi.getStrategies,
  });
}

/** Separate, slower query — AI insight must never block the workspace. */
export function useStrategyAIInsight(slug: string) {
  return useQuery({
    queryKey: strategyKeys.aiInsight(slug),
    queryFn: () => strategiesApi.getAIInsight(slug),
    staleTime: Infinity,
  });
}
