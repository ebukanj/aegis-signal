"use client";

import { useQuery } from "@tanstack/react-query";
import { useAnalyticsStore } from "@/stores/analytics-store";
import { analyticsApi } from "@/features/analytics/api/analytics-api";

/**
 * Analytics query hooks. The report hook depends on the filter store so
 * any filter change automatically triggers a re-fetch. The AI insights
 * hook is independent — insights don't change with filters.
 */

export const analyticsKeys = {
  report: (filters: Record<string, unknown>) =>
    ["analytics", "report", filters] as const,
  aiInsights: ["analytics", "ai-insights"] as const,
};

/** The complete analytics report, driven by the current filter state. */
export function useAnalyticsReport() {
  const filters = useAnalyticsStore((s) => s.filters);

  return useQuery({
    queryKey: analyticsKeys.report(filters as unknown as Record<string, unknown>),
    queryFn: () => analyticsApi.getReport(filters),
  });
}

/** AI-generated insights — independent of filters. */
export function useAnalyticsInsights() {
  return useQuery({
    queryKey: analyticsKeys.aiInsights,
    queryFn: analyticsApi.getAIInsights,
  });
}
