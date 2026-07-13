"use client";

import { memo, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Timeframe } from "@/types/domain";
import { cn } from "@/lib/utils";

interface TradingViewChartProps {
  /** TradingView symbol, e.g. "BINANCE:SOLUSDT". */
  symbol: string;
  timeframe?: Timeframe;
  className?: string;
  /** Accessible description of the chart. */
  ariaLabel: string;
}

const TIMEFRAME_TO_INTERVAL: Record<Timeframe, string> = {
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1d": "D",
};

/**
 * TradingView Advanced Chart embed (crosshair, timeframe switching, drawing
 * tools, fullscreen — all provided by the widget) with theme sync.
 *
 * The free embed cannot draw programmatic entry/SL/TP lines; those overlays
 * render in `PriceLevels` beside the chart and move into the chart itself
 * when the platform adopts the Charting Library with live data.
 */
function TradingViewChartInner({
  symbol,
  timeframe = "4h",
  className,
  ariaLabel,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget h-full w-full";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      interval: TIMEFRAME_TO_INTERVAL[timeframe],
      theme,
      style: "1",
      locale: "en",
      autosize: true,
      hide_side_toolbar: false, // keep drawing tools
      allow_symbol_change: false,
      withdateranges: true,
      details: false,
      calendar: false,
      backgroundColor: theme === "dark" ? "rgba(20, 23, 28, 1)" : "#ffffff",
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol, timeframe, theme]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={cn(
        // Taller than the old 420px: a chart you have to squint at is not a
        // chart. The space came from the price row that used to sit below it,
        // which duplicated the panel.
        "tradingview-widget-container h-[560px] w-full overflow-hidden rounded-lg border lg:h-[680px]",
        className,
      )}
    />
  );
}

export const TradingViewChart = memo(TradingViewChartInner);
