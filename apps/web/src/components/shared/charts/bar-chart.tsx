"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  HistogramSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export interface BarChartPoint {
  time: number; // unix seconds
  value: number;
}

interface BarChartProps {
  data: BarChartPoint[];
  className?: string;
  /** Accessible description of what the chart shows. */
  ariaLabel: string;
}

/**
 * Reusable histogram chart (Lightweight Charts) for periodic values such as
 * monthly returns — positive bars green, negative bars red, theme-aware axes.
 */
export function BarChart({ data, className, ariaLabel }: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const textColor = isDark
      ? "rgba(226, 232, 240, 0.55)"
      : "rgba(51, 65, 85, 0.65)";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: gridColor },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });

    const series = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(
      data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
        color:
          point.value >= 0 ? "rgba(16, 185, 129, 0.75)" : "rgba(239, 68, 68, 0.75)",
      })),
    );
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, isDark]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("h-48 w-full", className)}
    />
  );
}
