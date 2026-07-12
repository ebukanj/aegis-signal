"use client";

import dynamic from "next/dynamic";
import { ChartCard } from "@/components/shared/chart-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SignalDetail } from "@/features/signals/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

// TradingView widget is heavy and browser-only — lazy load it
const TradingViewChart = dynamic(
  () =>
    import("@/components/shared/charts/tradingview-chart").then(
      (mod) => mod.TradingViewChart,
    ),
  { ssr: false, loading: () => <Skeleton className="h-[420px] w-full md:h-[480px]" /> },
);

/** Maps our exchange names to TradingView symbol prefixes. */
const TV_EXCHANGE_PREFIX: Record<string, string> = {
  Binance: "BINANCE",
  Bybit: "BYBIT",
  OKX: "OKX",
  Bitget: "BITGET",
  KuCoin: "KUCOIN",
};

interface PriceLevel {
  label: string;
  price: number;
  tone: "entry" | "stop" | "target";
}

/**
 * Reusable trade-level legend. The free TradingView embed cannot render
 * programmatic lines, so levels live here; they move into the chart when the
 * platform adopts the Charting Library with live data.
 */
function PriceLevels({ levels }: { levels: PriceLevel[] }) {
  return (
    <ul
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      aria-label="Trade price levels"
    >
      {levels.map((level) => (
        <li
          key={level.label}
          className={cn(
            "rounded-md border-l-2 bg-card px-2.5 py-1.5",
            level.tone === "entry" && "border-l-primary",
            level.tone === "stop" && "border-l-short",
            level.tone === "target" && "border-l-long",
          )}
        >
          <p className="label-caps">{level.label}</p>
          <p
            className={cn(
              "font-numeric text-sm font-medium",
              level.tone === "stop" && "text-short",
              level.tone === "target" && "text-long",
            )}
          >
            {formatPrice(level.price)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Interactive chart + trade-level annotations. */
export function SignalChart({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  const prefix = TV_EXCHANGE_PREFIX[signal.exchange] ?? "BINANCE";
  const symbol = `${prefix}:${signal.coin}USDT`;

  const levels: PriceLevel[] = [
    { label: "Entry", price: signal.entryPrice, tone: "entry" },
    { label: "Stop Loss", price: signal.stopLoss, tone: "stop" },
    ...signal.takeProfits.map((tp, index) => ({
      label: `Target ${index + 1}`,
      price: tp,
      tone: "target" as const,
    })),
  ];

  return (
    <ChartCard
      title={`${signal.pair} — ${signal.timeframe}`}
      description="Interactive chart · crosshair, timeframes, drawing tools, fullscreen"
      className={className}
    >
      <TradingViewChart
        symbol={symbol}
        timeframe={signal.timeframe}
        ariaLabel={`${signal.pair} candlestick chart on ${signal.exchange}`}
      />
      <PriceLevels levels={levels} />
    </ChartCard>
  );
}
