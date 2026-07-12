import { create } from "zustand";
import type { AnalyticsFilters } from "@/features/analytics/types";
import { DEFAULT_FILTERS } from "@/features/analytics/types";

/**
 * Analytics filter state. Changing any filter causes the TanStack Query
 * key to update, which triggers a re-fetch of the analytics report.
 */
interface AnalyticsStore {
  filters: AnalyticsFilters;
  setFilter: <K extends keyof AnalyticsFilters>(
    key: K,
    value: AnalyticsFilters[K],
  ) => void;
  resetFilters: () => void;
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  filters: { ...DEFAULT_FILTERS },
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
}));
