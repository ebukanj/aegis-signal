"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { scannerApi } from "@/features/scanner/api/scanner-api";
import type { Opportunity, ScannerFilters } from "@/features/scanner/types";

export const scannerKeys = {
  opportunities: ["scanner", "opportunities"] as const,
};

export function useOpportunities() {
  return useQuery({
    queryKey: scannerKeys.opportunities,
    queryFn: scannerApi.getOpportunities,
    refetchInterval: 60_000, // scanner data goes stale quickly
  });
}

/**
 * Applies toolbar filters to the opportunity set.
 * Pure presentation filtering — becomes server-side query params later.
 */
export function useFilteredOpportunities(
  opportunities: Opportunity[] | undefined,
  filters: ScannerFilters,
): Opportunity[] {
  return useMemo(() => {
    if (!opportunities) return [];
    const search = filters.search.trim().toLowerCase();

    return opportunities.filter((opp) => {
      if (search) {
        const haystack =
          `${opp.coin} ${opp.pair} ${opp.exchange} ${opp.strategies.join(" ")}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.exchange !== "ALL" && opp.exchange !== filters.exchange)
        return false;
      if (
        filters.strategies.length > 0 &&
        !opp.strategies.some((s) => filters.strategies.includes(s))
      )
        return false;
      if (filters.regime !== "ALL" && opp.regime !== filters.regime)
        return false;
      if (filters.riskLevel !== "ALL" && opp.riskLevel !== filters.riskLevel)
        return false;
      if (filters.timeframe !== "ALL" && opp.timeframe !== filters.timeframe)
        return false;
      if (filters.direction !== "ALL" && opp.direction !== filters.direction)
        return false;
      if (opp.confidence < filters.minConfidence) return false;
      return true;
    });
  }, [opportunities, filters]);
}
