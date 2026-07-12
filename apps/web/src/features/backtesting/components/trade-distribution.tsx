"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { BarChart, type BarChartPoint } from "@/components/shared/charts/bar-chart";
import type { BacktestTrade } from "../types";

interface TradeDistributionProps {
  trades: BacktestTrade[];
  className?: string;
}

/**
 * Trade Distribution Charts for Backtesting.
 * Visualizes R-multiple distribution (wins vs losses) using bar charts.
 */
export function TradeDistribution({ trades, className }: TradeDistributionProps) {
  // Aggregate trades into R-multiple buckets
  const chartData = useMemo(() => {
    const buckets = [
      { label: "<-2R", min: -Infinity, max: -2 },
      { label: "-1R to -2R", min: -2, max: -1 },
      { label: "0 to -1R", min: -1, max: 0 },
      { label: "0 to 1R", min: 0, max: 1 },
      { label: "1R to 2R", min: 1, max: 2 },
      { label: "2R to 3R", min: 2, max: 3 },
      { label: ">3R", min: 3, max: Infinity },
    ];

    return buckets.map((b) => {
      const count = trades.filter((t) => t.returnR > b.min && t.returnR <= b.max).length;
      return {
        label: b.label,
        value: count,
        color: b.min >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))",
      };
    });
  }, [trades]);

  const maxCount = Math.max(...chartData.map(d => d.value), 1);

  return (
    <ChartCard
      title="R-Multiple Distribution"
      description="Frequency of trades by return size"
      className={className}
    >
      <div className="space-y-4 pt-4">
        {chartData.map((d) => {
          const pct = (d.value / maxCount) * 100;
          return (
            <div key={d.label} className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>{d.label}</span>
                <span className="font-numeric text-muted-foreground">{d.value}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ width: `${pct}%`, backgroundColor: d.color }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
