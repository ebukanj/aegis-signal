"use client";

import dynamic from "next/dynamic";
import { ChartCard } from "@/components/shared/chart-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SignalDetail } from "@/features/signals/types";
import { buildTradingViewSymbol } from "@/lib/tradingview-symbol";

// TradingView widget is heavy and browser-only — lazy load it.
const TradingViewChart = dynamic(
  () =>
    import("@/components/shared/charts/tradingview-chart").then(
      (mod) => mod.TradingViewChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[560px] w-full lg:h-[680px]" />,
  },
);

/**
 * The chart.
 *
 * The entry, stop and target row that used to sit beneath this was removed: the
 * signal panel already carries those numbers, and repeating them made the reader
 * check which copy to trust. Two sources for one number is one source too many —
 * the same rule that governs the contract governs the layout.
 *
 * The freed space went back into the chart, which is what a trader is actually
 * looking at.
 */
export function SignalChart({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  const symbol = buildTradingViewSymbol(signal);

  return (
    <ChartCard
      title={`${signal.pair} — ${signal.timeframe}`}
      description={`${signal.exchange} ${
        signal.marketType === "PERPETUAL" ? "perpetual" : "spot"
      } · crosshair, timeframes, drawing tools, fullscreen`}
      className={className}
    >
      <TradingViewChart
        symbol={symbol}
        timeframe={signal.timeframe}
        ariaLabel={`${signal.pair} candlestick chart on ${signal.exchange}`}
      />
    </ChartCard>
  );
}
