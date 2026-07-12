"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/features/dashboard/api/dashboard-api";

/**
 * Dashboard query hooks. One hook per widget so each section loads,
 * fails, and refreshes independently (no all-or-nothing dashboard).
 */

export const dashboardKeys = {
  marketIntelligence: ["dashboard", "market-intelligence"] as const,
  platformHealth: ["dashboard", "platform-health"] as const,
  signals: ["dashboard", "signals"] as const,
  bestOpportunity: ["dashboard", "best-opportunity"] as const,
  strategyHealth: ["dashboard", "strategy-health"] as const,
  activity: ["dashboard", "activity"] as const,
  marketOverview: ["dashboard", "market-overview"] as const,
};

export function useMarketIntelligence() {
  return useQuery({
    queryKey: dashboardKeys.marketIntelligence,
    queryFn: dashboardApi.getMarketIntelligence,
  });
}

export function usePlatformHealth() {
  return useQuery({
    queryKey: dashboardKeys.platformHealth,
    queryFn: dashboardApi.getPlatformHealth,
  });
}

export function useHighConfidenceSignals() {
  return useQuery({
    queryKey: dashboardKeys.signals,
    queryFn: dashboardApi.getHighConfidenceSignals,
  });
}

export function useBestOpportunity() {
  return useQuery({
    queryKey: dashboardKeys.bestOpportunity,
    queryFn: dashboardApi.getBestOpportunity,
  });
}

export function useStrategyHealth() {
  return useQuery({
    queryKey: dashboardKeys.strategyHealth,
    queryFn: dashboardApi.getStrategyHealth,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: dashboardKeys.activity,
    queryFn: dashboardApi.getRecentActivity,
  });
}

export function useMarketOverview() {
  return useQuery({
    queryKey: dashboardKeys.marketOverview,
    queryFn: dashboardApi.getMarketOverview,
  });
}
