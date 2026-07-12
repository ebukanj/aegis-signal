"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { REGIME_META, SERVICE_STATUS_META } from "@/constants/domain";
import {
  useMarketIntelligence,
  usePlatformHealth,
} from "@/features/dashboard/hooks/use-dashboard-data";
import { formatFullDate } from "@/lib/format";

function greetingForHour(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Dashboard hero: greeting, date, market regime, and platform status.
 * The date renders after mount to stay consistent with the client clock.
 */
export function DashboardHeader() {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const market = useMarketIntelligence();
  const health = usePlatformHealth();

  const regime = market.data ? REGIME_META[market.data.regime] : null;
  const scanner = health.data
    ? SERVICE_STATUS_META[health.data.scanner]
    : null;

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card p-4 md:p-5">
      {/* Single subtle brand accent — hierarchy, not decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-64 rounded-full bg-primary/[0.06] blur-3xl"
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          {today ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                {greetingForHour(today.getHours())}, Trader
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatFullDate(today)}
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-8 w-56 max-w-full" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {regime ? (
            <StatusBadge status={regime.status}>Market: {regime.label}</StatusBadge>
          ) : (
            <Skeleton className="h-6 w-36 rounded-md" />
          )}
          {scanner ? (
            <StatusBadge status={scanner.status}>
              Platform: {scanner.label}
            </StatusBadge>
          ) : (
            <Skeleton className="h-6 w-32 rounded-md" />
          )}
        </div>
      </div>
    </div>
  );
}
