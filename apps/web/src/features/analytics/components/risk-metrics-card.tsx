"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { AreaChart } from "@/components/shared/charts/area-chart";
import { RadialProgress } from "@/components/shared/radial-progress";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { RiskAnalytics } from "../types";
import { cn } from "@/lib/utils";

interface RiskMetricsCardProps {
  risk: RiskAnalytics;
  loading?: boolean;
  className?: string;
}

/**
 * Risk analytics: drawdown curve, portfolio heat gauge,
 * key risk stats, exposure by strategy and exchange.
 */
export function RiskMetricsCard({
  risk,
  loading = false,
  className,
}: RiskMetricsCardProps) {
  if (loading) {
    return (
      <ChartCard title="Risk Analytics" className={className}>
        <Skeleton className="h-64 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Risk Analytics"
      description="Drawdown, exposure, and risk distribution"
      className={className}
    >
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Drawdown curve */}
        <div className="lg:col-span-8">
          <span className="label-caps mb-2 block">Drawdown Curve</span>
          <AreaChart
            data={risk.drawdownCurve}
            tone="negative"
            ariaLabel="Drawdown curve showing portfolio decline from peak"
            className="h-48"
          />
        </div>

        {/* Portfolio heat + key stats */}
        <div className="flex flex-col items-center gap-4 lg:col-span-4">
          <span className="label-caps">Portfolio Heat</span>
          <RadialProgress
            value={risk.portfolioHeat}
            size={96}
            strokeWidth={8}
            label={`Portfolio heat ${risk.portfolioHeat} out of 100`}
          />
          <div className="grid w-full grid-cols-2 gap-2">
            <RiskStat label="Max Drawdown" value={`${risk.maxDrawdown.toFixed(1)}%`} tone="error" />
            <RiskStat label="Current DD" value={`${risk.currentDrawdown.toFixed(1)}%`} tone={risk.currentDrawdown < -5 ? "error" : "warning"} />
            <RiskStat label="Avg Risk" value={`${risk.avgRisk.toFixed(2)}%`} tone="neutral" />
            <RiskStat label="Largest Win" value={`+${risk.largestWinR.toFixed(2)}R`} tone="success" />
            <RiskStat label="Largest Loss" value={`${risk.largestLossR.toFixed(2)}R`} tone="error" />
          </div>
        </div>
      </div>

      {/* Risk distribution */}
      <div className="mt-4">
        <span className="label-caps mb-2 block">Risk per Trade Distribution</span>
        <div className="flex items-end gap-1">
          {risk.riskDistribution.map((bin) => {
            const maxCount = Math.max(...risk.riskDistribution.map((b) => b.count), 1);
            const height = Math.max(4, (bin.count / maxCount) * 64);
            return (
              <div key={bin.label} className="flex-1 text-center" title={`${bin.label}: ${bin.count} trades`}>
                <div
                  className={cn(
                    "mx-auto w-full rounded-t-sm",
                    bin.tone === "positive" ? "bg-success/50" :
                    bin.tone === "negative" ? "bg-destructive/50" : "bg-muted-foreground/30",
                  )}
                  style={{ height: `${height}px` }}
                />
                <span className="font-numeric mt-1 block text-[9px] text-muted-foreground">
                  {bin.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Exposure breakdowns */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ExposurePanel title="Exposure by Strategy" slices={risk.exposureByStrategy} />
        <ExposurePanel title="Exposure by Exchange" slices={risk.exposureByExchange} />
      </div>
    </ChartCard>
  );
}

function RiskStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "error" | "neutral";
}) {
  const cls = {
    success: "text-success",
    warning: "text-warning",
    error: "text-destructive",
    neutral: "text-foreground",
  };
  return (
    <div className="rounded-md border p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("font-numeric text-sm font-semibold", cls[tone])}>{value}</p>
    </div>
  );
}

function ExposurePanel({
  title,
  slices,
}: {
  title: string;
  slices: { label: string; share: number; netR: number }[];
}) {
  return (
    <div>
      <span className="label-caps mb-2 block">{title}</span>
      <div className="space-y-1.5">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-2 text-xs">
            <span className="w-20 truncate font-medium">{slice.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary/60"
                style={{ width: `${Math.min(100, slice.share)}%` }}
              />
            </div>
            <span className="font-numeric w-12 text-right text-muted-foreground">
              {slice.share.toFixed(1)}%
            </span>
            <span
              className={cn(
                "font-numeric w-14 text-right",
                slice.netR >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {slice.netR >= 0 ? "+" : ""}{slice.netR.toFixed(1)}R
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
