"use client";

import {
  Activity,
  BarChart3,
  Clock,
  Crosshair,
  Flame,
  Layers,
  Percent,
  Sigma,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import type { AnalyticsKpi, KpiKey } from "../types";
import { cn } from "@/lib/utils";

const KPI_ICONS: Record<KpiKey, LucideIcon> = {
  totalSignals: Zap,
  winRate: Target,
  lossRate: TrendingDown,
  profitFactor: BarChart3,
  netReturn: TrendingUp,
  expectancy: Sigma,
  avgRMultiple: Crosshair,
  avgHoldingTime: Clock,
  maxDrawdown: Flame,
  avgConfidence: Percent,
  activeStrategies: Layers,
  totalTrades: Activity,
};

interface KpiOverviewProps {
  kpis: AnalyticsKpi[];
  loading?: boolean;
  className?: string;
}

/**
 * 12 KPI metric cards in a responsive grid.
 * Uses the existing MetricCard component — icons are mapped by KPI key.
 */
export function KpiOverview({ kpis, loading = false, className }: KpiOverviewProps) {
  if (loading) {
    return (
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", className)}>
        {Array.from({ length: 12 }).map((_, i) => (
          <MetricCard key={i} label="" value="" loading />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
        className,
      )}
      role="region"
      aria-label="Key performance indicators"
    >
      {kpis.map((kpi) => (
        <MetricCard
          key={kpi.key}
          label={kpi.label}
          value={kpi.value}
          delta={kpi.delta}
          deltaDirection={kpi.deltaDirection}
          hint={kpi.hint}
          icon={KPI_ICONS[kpi.key]}
          size="compact"
        />
      ))}
    </div>
  );
}
