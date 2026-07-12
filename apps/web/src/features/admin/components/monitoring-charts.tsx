"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { createChart, ColorType } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import type { AdminMonitoring, MonitoringDataPoint } from "../types";
import { Activity } from "lucide-react";

function SystemChart({ data, title, color }: { data: MonitoringDataPoint[], title: string, color: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: 'rgba(197, 203, 206, 0.1)' },
        horzLines: { color: 'rgba(197, 203, 206, 0.1)' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });

    // @ts-expect-error addAreaSeries is missing from the v5 type definitions
    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}80`,
      bottomColor: 'transparent',
      lineWidth: 2,
    });

    // `time` is unix seconds, which is what UTCTimestamp represents.
    series.setData(data.map(d => ({ time: d.time as UTCTimestamp, value: d.value })));

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, color]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold">{title}</h3>
        <Activity className="size-4 text-muted-foreground" />
      </div>
      <div ref={chartContainerRef} className="w-full h-[200px]" />
    </Card>
  );
}

export function MonitoringCharts({ monitoring }: { monitoring: AdminMonitoring }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">System Monitoring</h2>
        <p className="text-muted-foreground text-sm mt-1">Real-time resource utilization and throughput.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SystemChart data={monitoring.cpu} title="CPU Utilization (%)" color="#3b82f6" />
        <SystemChart data={monitoring.memory} title="Memory Usage (%)" color="#8b5cf6" />
        <SystemChart data={monitoring.network} title="Network Throughput (MB/s)" color="#10b981" />
        <Card className="p-6 flex flex-col items-center justify-center text-center space-y-2 bg-muted/20">
          <Activity className="size-8 text-muted-foreground mb-2" />
          <h3 className="font-medium">More Metrics Available in Datadog</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            For advanced querying, distributed tracing, and long-term retention, please view the primary Datadog dashboard.
          </p>
          <a href="#" className="text-sm text-primary hover:underline mt-2">Open Datadog</a>
        </Card>
      </div>
    </div>
  );
}
