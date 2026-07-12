"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { AreaChart, type AreaChartPoint } from "@/components/shared/charts/area-chart";
import { format } from "date-fns";

interface BacktestEquityCurveProps {
  data: { time: number; value: number }[];
  className?: string;
}

/**
 * Interactive Equity Curve chart for the Backtesting Laboratory.
 * Displays portfolio capital growth in dollars.
 */
export function BacktestEquityCurve({ data, className }: BacktestEquityCurveProps) {
  const chartData: AreaChartPoint[] = useMemo(() => {
    return data.map((d) => ({
      time: d.time,
      value: d.value,
    }));
  }, [data]);

  return (
    <ChartCard
      title="Equity Curve"
      description="Simulated capital growth over time"
      className={className}
    >
      <div className="h-[350px] w-full pt-4">
        <AreaChart
          data={chartData}
          ariaLabel="Equity Curve"
        />
      </div>
    </ChartCard>
  );
}
