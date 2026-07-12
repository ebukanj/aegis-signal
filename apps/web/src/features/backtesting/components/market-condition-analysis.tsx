"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { BarChart, type BarChartPoint } from "@/components/shared/charts/bar-chart";
import type { BacktestTrade, MarketRegime } from "../types";

interface MarketConditionAnalysisProps {
  trades: BacktestTrade[];
  className?: string;
}

/**
 * Visualizes backtest performance across different market conditions (regimes).
 */
export function MarketConditionAnalysis({ trades, className }: MarketConditionAnalysisProps) {
  const chartData = useMemo(() => {
    if (!trades.length) return [];

    const regimes = [...new Set(trades.map((t) => t.regime))];
    
    return regimes.map((regime) => {
      const regimeTrades = trades.filter((t) => t.regime === regime);
      const totalR = regimeTrades.reduce((sum, t) => sum + t.returnR, 0);
      
      return {
        label: regime.replace("_", " "),
        value: totalR,
        color: totalR >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))",
      };
    }).sort((a, b) => b.value - a.value); // Sort best to worst

  }, [trades]);

  const maxR = Math.max(...chartData.map(d => Math.abs(d.value)), 1);

  return (
    <ChartCard
      title="Performance by Market Condition"
      description="Total R-Multiple grouped by market regime"
      className={className}
    >
      <div className="space-y-4 pt-4">
        {chartData.map((d) => {
          const pct = (Math.abs(d.value) / maxR) * 100;
          return (
            <div key={d.label} className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span>{d.label}</span>
                <span className={`font-numeric ${d.value >= 0 ? "text-success" : "text-destructive"}`}>
                  {d.value > 0 ? "+" : ""}{d.value.toFixed(1)}R
                </span>
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
