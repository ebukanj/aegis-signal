"use client";

import { History } from "lucide-react";
import { AreaChart } from "@/components/shared/charts/area-chart";
import { Card } from "@/components/ui/card";
import type { SignalDetail } from "@/features/signals/types";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Answers: "Has this strategy actually earned trust?"
 * Live-tracked statistics for the generating strategy plus its equity curve.
 */
export function HistoricalPerformance({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  const stats = signal.strategyStats;
  const metrics = [
    { label: "Win Rate", value: formatPercent(stats.winRate, false) },
    { label: "Avg Return", value: `${stats.avgReturnR} R` },
    { label: "Avg Drawdown", value: formatPercent(stats.avgDrawdown, false) },
    { label: "Profit Factor", value: String(stats.profitFactor) },
    { label: "Expectancy", value: `${stats.expectancy} R` },
    { label: "Closed Trades", value: String(stats.totalTrades) },
  ];

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center gap-2">
        <History className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">
          Historical Performance — {signal.strategies[0]}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border p-3">
            <p className="label-caps">{metric.label}</p>
            <p className="font-numeric mt-1 text-lg font-semibold">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="label-caps">Equity curve · last {stats.equityCurve.length} days (mock)</p>
        <AreaChart
          data={stats.equityCurve}
          tone={
            stats.equityCurve[stats.equityCurve.length - 1].value >=
            stats.equityCurve[0].value
              ? "positive"
              : "negative"
          }
          className="h-48"
          ariaLabel={`${signal.strategies[0]} equity curve over the last ${stats.equityCurve.length} days`}
        />
      </div>
    </Card>
  );
}
