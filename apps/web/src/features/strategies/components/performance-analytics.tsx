"use client";

import { AreaChart } from "@/components/shared/charts/area-chart";
import { BarChart } from "@/components/shared/charts/bar-chart";
import { Card } from "@/components/ui/card";
import type { StrategyProfile } from "@/features/strategies/types";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Answers: "What are the numbers behind this strategy?" */
export function PerformanceAnalytics({
  strategy,
  className,
}: {
  strategy: StrategyProfile;
  className?: string;
}) {
  const metrics = [
    { label: "Win Rate", value: formatPercent(strategy.winRate, false) },
    { label: "Profit Factor", value: String(strategy.profitFactor) },
    { label: "Expectancy", value: `${strategy.expectancy} R` },
    { label: "Avg Return", value: `${strategy.avgReturnR} R` },
    { label: "Avg Drawdown", value: formatPercent(strategy.avgDrawdown, false) },
    { label: "Signals / Week", value: String(strategy.signalsPerWeek) },
  ];
  const curve = strategy.equityCurve;
  const isUp = curve[curve.length - 1].value >= curve[0].value;

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <h3 className="text-sm font-semibold tracking-tight">
        Performance Analytics
      </h3>

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <p className="label-caps">Rolling performance · 90 days (mock)</p>
          <AreaChart
            data={curve}
            tone={isUp ? "positive" : "negative"}
            className="h-44"
            ariaLabel={`${strategy.name} rolling equity over 90 days`}
          />
        </div>
        <div className="space-y-1.5">
          <p className="label-caps">Monthly return (R) · last 6 months (mock)</p>
          <BarChart
            data={strategy.monthlyReturns}
            className="h-44"
            ariaLabel={`${strategy.name} monthly returns in R`}
          />
        </div>
      </div>
    </Card>
  );
}
