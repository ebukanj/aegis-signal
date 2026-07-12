"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TradeDistribution, DistributionBin } from "../types";
import { cn } from "@/lib/utils";

interface TradeDistributionChartProps {
  distribution: TradeDistribution;
  loading?: boolean;
  className?: string;
}

/**
 * Trade distribution charts: direction split, outcome breakdown,
 * holding time, return, and confidence histograms.
 */
export function TradeDistributionChart({
  distribution,
  loading = false,
  className,
}: TradeDistributionChartProps) {
  if (loading) {
    return (
      <ChartCard title="Trade Distribution" className={className}>
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Trade Distribution"
      description="Breakdown of trading behavior and outcomes"
      className={className}
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Direction split */}
        <div>
          <span className="label-caps mb-2 block">Direction</span>
          <div className="space-y-2">
            {distribution.direction.map((d) => {
              const total = distribution.direction.reduce((s, x) => s + x.trades, 0);
              const pct = total === 0 ? 0 : (d.trades / total) * 100;
              return (
                <div key={d.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", d.label === "LONG" ? "text-long" : "text-short")}>
                      {d.label}
                    </span>
                    <span className="font-numeric text-muted-foreground">
                      {d.trades} ({pct.toFixed(0)}%) · WR {d.winRate.toFixed(1)}% · {d.netR >= 0 ? "+" : ""}{d.netR.toFixed(1)}R
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        d.label === "LONG" ? "bg-long/50" : "bg-short/50",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Outcome split */}
        <div>
          <span className="label-caps mb-2 block">Outcomes</span>
          <div className="space-y-2">
            {distribution.outcome.map((o) => {
              const tone = o.label === "WIN" ? "bg-success/50" : o.label === "LOSS" ? "bg-destructive/50" : "bg-muted-foreground/30";
              return (
                <div key={o.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{o.label}</span>
                    <span className="font-numeric text-muted-foreground">
                      {o.trades} ({o.share.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("absolute inset-y-0 left-0 rounded-full", tone)}
                      style={{ width: `${o.share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Holding time histogram */}
        <Histogram title="Holding Time" bins={distribution.holdingTime} />

        {/* Return distribution histogram */}
        <Histogram title="Return Distribution" bins={distribution.returns} />

        {/* Confidence distribution histogram */}
        <Histogram title="Confidence Distribution" bins={distribution.confidence} />
      </div>
    </ChartCard>
  );
}

function Histogram({ title, bins }: { title: string; bins: DistributionBin[] }) {
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  return (
    <div>
      <span className="label-caps mb-2 block">{title}</span>
      <div className="flex items-end gap-1.5">
        {bins.map((bin) => {
          const height = Math.max(4, (bin.count / maxCount) * 72);
          return (
            <div key={bin.label} className="flex-1 text-center" title={`${bin.label}: ${bin.count}`}>
              <div
                className={cn(
                  "mx-auto w-full rounded-t-sm",
                  bin.tone === "positive" ? "bg-success/50" :
                  bin.tone === "negative" ? "bg-destructive/50" : "bg-muted-foreground/30",
                )}
                style={{ height: `${height}px` }}
              />
              <span className="font-numeric mt-1 block text-[8px] leading-tight text-muted-foreground">
                {bin.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
