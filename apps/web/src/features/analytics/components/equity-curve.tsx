"use client";

import { useState } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { AreaChart, type AreaChartPoint } from "@/components/shared/charts/area-chart";
import { BarChart, type BarChartPoint } from "@/components/shared/charts/bar-chart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReturnSeries } from "../types";
import { cn } from "@/lib/utils";

interface EquityCurveProps {
  equityCurve: AreaChartPoint[];
  returns: ReturnSeries;
  loading?: boolean;
  className?: string;
}

/**
 * Performance chart with tabbed views:
 * Equity Curve (area) · Cumulative Returns (area) · Daily/Weekly/Monthly Returns (histogram).
 */
export function EquityCurve({
  equityCurve,
  returns,
  loading = false,
  className,
}: EquityCurveProps) {
  if (loading) {
    return (
      <ChartCard title="Performance" className={className}>
        <Skeleton className="h-64 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Performance" className={className}>
      <Tabs defaultValue="equity">
        <TabsList variant="line" className="mb-3">
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>

        <TabsContent value="equity">
          <AreaChart
            data={equityCurve}
            tone={equityCurve.length > 1 && equityCurve[equityCurve.length - 1].value >= equityCurve[0].value ? "positive" : "negative"}
            ariaLabel="Equity curve showing portfolio value over time"
            className="h-72"
          />
        </TabsContent>

        <TabsContent value="cumulative">
          <AreaChart
            data={returns.cumulative}
            tone={returns.cumulative.length > 0 && returns.cumulative[returns.cumulative.length - 1].value >= 0 ? "positive" : "negative"}
            ariaLabel="Cumulative returns over time"
            className="h-72"
          />
        </TabsContent>

        <TabsContent value="daily">
          <BarChart
            data={returns.daily}
            ariaLabel="Daily returns histogram"
            className="h-72"
          />
        </TabsContent>

        <TabsContent value="weekly">
          <BarChart
            data={returns.weekly}
            ariaLabel="Weekly returns histogram"
            className="h-72"
          />
        </TabsContent>

        <TabsContent value="monthly">
          <BarChart
            data={returns.monthly}
            ariaLabel="Monthly returns histogram"
            className="h-72"
          />
        </TabsContent>
      </Tabs>
    </ChartCard>
  );
}
