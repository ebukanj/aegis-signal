"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { AreaChart } from "@/components/shared/charts/area-chart";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketOverview } from "@/features/dashboard/hooks/use-dashboard-data";
import { formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Answers: "What is the market anchor (BTC) doing?"
 * 48-hour overview. Mock series until the Market Intelligence Engine ships.
 */
export function MarketOverviewChart({ className }: { className?: string }) {
  const { data, isPending, isError, refetch } = useMarketOverview();

  if (isError) {
    return (
      <ErrorState
        title="Market overview unavailable"
        description="The market data feed could not be loaded."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  const isUp = (data?.changePercent24h ?? 0) >= 0;

  return (
    <ChartCard
      title={data ? `Market Overview — ${data.symbol}` : "Market Overview"}
      description="Last 48 hours · 30m intervals"
      className={className}
      headerSlot={
        data ? (
          <div className="text-right">
            <p className="font-numeric text-lg font-semibold leading-none">
              {formatPrice(data.lastPrice)}
            </p>
            <p
              className={cn(
                "font-numeric mt-1 text-xs font-medium",
                isUp ? "text-success" : "text-destructive",
              )}
            >
              {isUp ? "▲" : "▼"} {formatPercent(data.changePercent24h)} · 24h
            </p>
          </div>
        ) : (
          <Skeleton className="h-10 w-28" />
        )
      }
    >
      {isPending || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <AreaChart
          data={data.series}
          tone={isUp ? "positive" : "negative"}
          ariaLabel={`${data.symbol} price over the last 48 hours, currently ${formatPrice(data.lastPrice)}`}
        />
      )}
    </ChartCard>
  );
}
