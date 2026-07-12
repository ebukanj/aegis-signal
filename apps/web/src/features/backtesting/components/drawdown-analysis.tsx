"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { AreaChart, type AreaChartPoint } from "@/components/shared/charts/area-chart";
import { format } from "date-fns";
import type { BacktestDrawdownAnalysis as DrawdownData } from "../types";

interface DrawdownAnalysisProps {
  curve: { time: number; value: number }[];
  analysis: DrawdownData;
  className?: string;
}

/**
 * Drawdown curve and analysis metrics for Backtesting.
 * Visualizes the peak-to-trough decline over time.
 */
export function DrawdownAnalysis({ curve, analysis, className }: DrawdownAnalysisProps) {
  const chartData: AreaChartPoint[] = useMemo(() => {
    return curve.map((d) => ({
      time: d.time,
      value: d.value, // Negative percentage
    }));
  }, [curve]);

  return (
    <div className={className}>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* The Curve */}
        <ChartCard
          title="Drawdown Curve"
          description="Percentage decline from peak equity"
        >
          <div className="h-[250px] w-full pt-4">
            <AreaChart
              data={chartData}
              tone="negative"
              ariaLabel="Drawdown Curve"
            />
          </div>
        </ChartCard>

        {/* Analysis Metrics */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Metric title="Max Drawdown" value={`${analysis.maxDrawdownPct.toFixed(1)}%`} isNegative />
          <Metric title="Avg Drawdown" value={`${analysis.avgDrawdownPct.toFixed(1)}%`} />
          <Metric title="Recovery Time" value={`${analysis.recoveryTimeDays} days`} />
          <Metric title="Worst Trade" value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(analysis.worstTradeDollar)} isNegative />
          <Metric title="Worst Week" value={`${analysis.worstWeekPct.toFixed(1)}%`} isNegative />
          <Metric title="Worst Month" value={`${analysis.worstMonthPct.toFixed(1)}%`} isNegative />
        </div>
      </div>
    </div>
  );
}

function Metric({ title, value, isNegative = false }: { title: string; value: string; isNegative?: boolean }) {
  return (
    <div className="flex flex-col justify-center rounded-xl border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <span className={`mt-1 font-numeric text-lg font-semibold ${isNegative ? "text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  );
}
