"use client";

import { useMemo } from "react";
import { AreaChart, type AreaChartPoint } from "@/components/shared/charts/area-chart";
import { ChartCard } from "@/components/shared/chart-card";
import type { PortfolioChartPoint } from "../types";

interface PortfolioChartProps {
  data: PortfolioChartPoint[];
  className?: string;
}

export function PortfolioChart({ data, className }: PortfolioChartProps) {
  const chartData: AreaChartPoint[] = useMemo(() => {
    return data.map((d) => ({
      time: d.time,
      value: d.value,
    }));
  }, [data]);

  const totalReturn = data.length > 0 ? (data[data.length - 1].value / data[0].value) - 1 : 0;

  return (
    <ChartCard
      title="Portfolio Performance"
      description="Equity curve over time"
      className={className}
    >
      <div className="h-[350px] w-full pt-4">
        <AreaChart
          data={chartData}
          tone={totalReturn >= 0 ? "positive" : "negative"}
          ariaLabel="Portfolio Equity Curve"
        />
      </div>
    </ChartCard>
  );
}
