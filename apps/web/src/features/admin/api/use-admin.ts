"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "./admin-api";

const OVERVIEW_KEY = ["admin", "overview"] as const;
const AUDIT_KEY = ["admin", "audit"] as const;

/**
 * The platform overview, polled.
 *
 * Admin is a live console, so it refetches on an interval — an operator watching a
 * queue drain or a flag take effect should not have to reload the page. The interval
 * is modest (10s): this is a dashboard a human reads, not a hot path, and the payload
 * aggregates every module.
 */
export function useAdminOverview() {
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: adminApi.getOverview,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useAuditLog() {
  return useQuery({ queryKey: AUDIT_KEY, queryFn: adminApi.getAudit, refetchInterval: 15_000 });
}

/** Flip a feature flag, then refresh the overview so the change is reflected at once. */
export function useSetFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, change }: { key: string; change: { enabled?: boolean; rolloutPercent?: number } }) =>
      adminApi.setFlag(key, change),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      void qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}

/** Enter or leave maintenance mode; refresh overview and audit. */
export function useSetMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminApi.setMaintenance,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      void qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}
