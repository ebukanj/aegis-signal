"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export interface AreaChartPoint {
  time: number; // unix seconds
  value: number;
}

interface AreaChartProps {
  data: AreaChartPoint[];
  /** Semantic tone of the series. */
  tone?: "positive" | "negative" | "neutral";
  className?: string;
  /** Accessible description of what the chart shows. */
  ariaLabel: string;
}

const TONE_COLORS = {
  positive: { line: "#10b981", top: "rgba(16, 185, 129, 0.25)" },
  negative: { line: "#ef4444", top: "rgba(239, 68, 68, 0.25)" },
  neutral: { line: "#3b82f6", top: "rgba(59, 130, 246, 0.25)" },
} as const;

/**
 * Reusable area chart (Lightweight Charts).
 * Theme-aware axes/grid; crosshair enabled; resizes with its container.
 */
export function AreaChart({
  data,
  tone = "positive",
  className,
  ariaLabel,
}: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const textColor = isDark ? "rgba(226, 232, 240, 0.55)" : "rgba(51, 65, 85, 0.65)";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
    const colors = TONE_COLORS[tone];

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: colors.line },
        vertLine: { labelBackgroundColor: colors.line },
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      lineWidth: 2,
      topColor: colors.top,
      bottomColor: "transparent",
      priceLineVisible: false,
    });
    series.setData(
      data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    );
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, tone, isDark]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("h-64 w-full", className)}
    />
  );
}
