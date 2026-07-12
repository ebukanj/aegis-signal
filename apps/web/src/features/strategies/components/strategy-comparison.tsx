"use client";

import { GitCompareArrows } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StrategyStatusBadge } from "@/features/strategies/components/strategy-status-badge";
import type { StrategyProfile } from "@/features/strategies/types";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StrategyComparisonProps {
  strategies: StrategyProfile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Side-by-side comparison: metrics as rows, one column per strategy.
 * The best value in each row is highlighted.
 */
export function StrategyComparison({
  strategies,
  open,
  onOpenChange,
}: StrategyComparisonProps) {
  const rows: {
    label: string;
    value: (s: StrategyProfile) => number;
    format: (v: number) => string;
    /** Whether higher is better. */
    higherIsBetter: boolean;
  }[] = [
    { label: "Win Rate", value: (s) => s.winRate, format: (v) => formatPercent(v, false), higherIsBetter: true },
    { label: "Expectancy", value: (s) => s.expectancy, format: (v) => `${v} R`, higherIsBetter: true },
    { label: "Profit Factor", value: (s) => s.profitFactor, format: String, higherIsBetter: true },
    { label: "Avg Return", value: (s) => s.avgReturnR, format: (v) => `${v} R`, higherIsBetter: true },
    { label: "Max Drawdown", value: (s) => s.avgDrawdown, format: (v) => formatPercent(v, false), higherIsBetter: false },
    { label: "Avg Confidence", value: (s) => s.avgConfidence, format: String, higherIsBetter: true },
    { label: "Signals / Week", value: (s) => s.signalsPerWeek, format: String, higherIsBetter: true },
    { label: "Health", value: (s) => s.health.score, format: (v) => `${v}/100`, higherIsBetter: true },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitCompareArrows className="size-4 text-primary" aria-hidden />
            Strategy Comparison
          </SheetTitle>
          <SheetDescription>
            Best value per metric is highlighted. Drawdown: lower is better.
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-x-auto px-4 pb-6">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="label-caps p-2 text-left">Metric</th>
                {strategies.map((s) => (
                  <th key={s.slug} className="p-2 text-left">
                    <div className="space-y-1">
                      <p className="font-semibold tracking-tight">{s.name}</p>
                      <StrategyStatusBadge status={s.status} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = strategies.map(row.value);
                const best = row.higherIsBetter
                  ? Math.max(...values)
                  : Math.min(...values);
                return (
                  <tr key={row.label} className="border-t">
                    <td className="p-2 text-muted-foreground">{row.label}</td>
                    {strategies.map((s, i) => (
                      <td
                        key={s.slug}
                        className={cn(
                          "font-numeric p-2 font-medium",
                          values[i] === best && "text-success",
                        )}
                      >
                        {row.format(values[i])}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t">
                <td className="p-2 text-muted-foreground">Best Market</td>
                {strategies.map((s) => {
                  const top = Object.entries(s.compatibility).sort(
                    (a, b) => b[1] - a[1],
                  )[0][0];
                  return (
                    <td key={s.slug} className="p-2">
                      {top}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
