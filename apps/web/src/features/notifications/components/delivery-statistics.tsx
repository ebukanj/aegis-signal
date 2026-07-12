"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import { AreaChart, type AreaChartPoint } from "@/components/shared/charts/area-chart";
import type { DeliveryStatistics } from "../types";

export function DeliveryStatisticsCharts({ stats }: { stats: DeliveryStatistics }) {
  const chartData: AreaChartPoint[] = useMemo(() => {
    // Reverse the array to go chronologically (oldest to newest)
    return [...stats.dailyVolume30Days].reverse().map((d) => ({
      time: d.time,
      value: d.volume,
    }));
  }, [stats]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Volume Chart */}
      <ChartCard title="Delivery Volume" description="Alerts sent over the last 30 days" className="lg:col-span-2">
        <div className="h-[300px] w-full pt-4">
          <AreaChart
            data={chartData}
            tone="neutral"
            ariaLabel="Daily Delivery Volume"
          />
        </div>
      </ChartCard>

      {/* Breakdowns */}
      <div className="space-y-6">
        <ChartCard title="By Channel" description="Last 7 days volume distribution">
          <div className="space-y-4 pt-4">
            {stats.volumeByChannel.map((ch) => {
              const pct = (ch.count / stats.totalVolumeWeek) * 100;
              return (
                <div key={ch.channel} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span>{ch.channel}</span>
                    <span className="font-numeric text-muted-foreground">{ch.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div 
                      className="h-full rounded-full transition-all duration-500 bg-primary" 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title="By Type" description="Last 7 days event distribution">
          <div className="space-y-4 pt-4">
            {stats.volumeByType.slice(0, 4).map((type) => {
              const pct = (type.count / stats.totalVolumeWeek) * 100;
              return (
                <div key={type.type} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span>{type.type.replace("_", " ")}</span>
                    <span className="font-numeric text-muted-foreground">{type.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div 
                      className="h-full rounded-full transition-all duration-500 bg-secondary-foreground/30" 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
