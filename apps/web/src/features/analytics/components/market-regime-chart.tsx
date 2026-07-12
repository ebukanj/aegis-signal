"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { REGIME_META } from "@/constants/domain";
import type { RegimePerformance } from "../types";
import { cn } from "@/lib/utils";

interface MarketRegimeChartProps {
  regimes: RegimePerformance[];
  loading?: boolean;
  className?: string;
}

/**
 * Market regime performance comparison: horizontal grouped bars for each
 * regime showing signals, win rate, expectancy, net R, and best strategy.
 */
export function MarketRegimeChart({
  regimes,
  loading = false,
  className,
}: MarketRegimeChartProps) {
  if (loading) {
    return (
      <ChartCard title="Market Regime Performance" className={className}>
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }

  const maxSignals = Math.max(...regimes.map((r) => r.signals), 1);
  const maxNetR = Math.max(...regimes.map((r) => Math.abs(r.netR)), 1);

  return (
    <ChartCard
      title="Market Regime Performance"
      description="How strategies perform across market conditions"
      className={className}
    >
      <div className="space-y-3">
        {regimes.map((regime) => {
          const meta = REGIME_META[regime.regime];
          const signalBar = (regime.signals / maxSignals) * 100;
          const netRBar = (Math.abs(regime.netR) / maxNetR) * 100;

          return (
            <div
              key={regime.regime}
              className="rounded-lg border p-3 transition-colors hover:border-foreground/15"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={meta.status}>{meta.label}</StatusBadge>
                  <span className="font-numeric text-xs text-muted-foreground">
                    {regime.days} days
                  </span>
                </div>
                {regime.bestStrategy && (
                  <span className="text-xs text-muted-foreground">
                    Best: <span className="font-medium text-foreground">{regime.bestStrategy}</span>
                  </span>
                )}
              </div>

              {/* Metric bars */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <RegimeMetric
                  label="Signals"
                  value={regime.signals.toString()}
                  barWidth={signalBar}
                  tone="neutral"
                />
                <RegimeMetric
                  label="Win Rate"
                  value={`${regime.winRate.toFixed(1)}%`}
                  barWidth={regime.winRate}
                  tone={regime.winRate >= 50 ? "success" : "error"}
                />
                <RegimeMetric
                  label="Expectancy"
                  value={`${regime.expectancy >= 0 ? "+" : ""}${regime.expectancy.toFixed(3)}R`}
                  barWidth={Math.abs(regime.expectancy) * 100}
                  tone={regime.expectancy >= 0 ? "success" : "error"}
                />
                <RegimeMetric
                  label="Net R"
                  value={`${regime.netR >= 0 ? "+" : ""}${regime.netR.toFixed(2)}R`}
                  barWidth={netRBar}
                  tone={regime.netR >= 0 ? "success" : "error"}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

function RegimeMetric({
  label,
  value,
  barWidth,
  tone,
}: {
  label: string;
  value: string;
  barWidth: number;
  tone: "success" | "error" | "neutral";
}) {
  const barColor = {
    success: "bg-success/40",
    error: "bg-destructive/40",
    neutral: "bg-muted-foreground/25",
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-numeric font-medium">{value}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", barColor[tone])}
          style={{ width: `${Math.min(100, barWidth)}%` }}
        />
      </div>
    </div>
  );
}
