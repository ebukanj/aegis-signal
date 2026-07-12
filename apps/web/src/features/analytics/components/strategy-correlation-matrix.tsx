"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CorrelationMatrix } from "../types";
import { cn } from "@/lib/utils";

interface StrategyCorrelationMatrixProps {
  correlation: CorrelationMatrix;
  loading?: boolean;
  className?: string;
}

/** Map a Pearson correlation value (−1…1) to a background color. */
function correlationColor(v: number): string {
  if (v >= 0.7) return "bg-destructive/50";
  if (v >= 0.4) return "bg-warning/30";
  if (v >= -0.1) return "bg-muted/40";
  if (v >= -0.4) return "bg-info/30";
  return "bg-success/40";
}

/**
 * N×N correlation matrix with color-coded cells + complementary/overlapping
 * strategy pairs summary.
 */
export function StrategyCorrelationMatrix({
  correlation,
  loading = false,
  className,
}: StrategyCorrelationMatrixProps) {
  if (loading) {
    return (
      <ChartCard title="Strategy Correlation" className={className}>
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }

  const { strategies, values, complementary, overlapping } = correlation;

  return (
    <ChartCard
      title="Strategy Correlation"
      description="Monthly net-R Pearson correlation — low correlation means diversification"
      className={className}
    >
      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-center" role="grid" aria-label="Strategy correlation matrix">
          <thead>
            <tr>
              <th className="p-1" />
              {strategies.map((s) => (
                <th
                  key={s.slug}
                  className="p-1 text-[9px] font-medium text-muted-foreground"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxWidth: "20px" }}
                >
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map((rowStrat, ri) => (
              <tr key={rowStrat.slug}>
                <td className="pr-2 text-right text-[10px] font-medium">
                  {rowStrat.name}
                </td>
                {strategies.map((colStrat, ci) => {
                  const val = values[ri][ci];
                  const isDiagonal = ri === ci;
                  return (
                    <td
                      key={colStrat.slug}
                      className={cn(
                        "font-numeric size-8 rounded-sm text-[9px] font-medium transition-transform hover:scale-110",
                        isDiagonal ? "bg-muted/60" : correlationColor(val),
                      )}
                      title={`${rowStrat.name} × ${colStrat.name}: ${val.toFixed(3)}`}
                    >
                      {isDiagonal ? "—" : val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pairs summary */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PairList
          title="Complementary (Diversifiers)"
          pairs={complementary}
          tone="success"
        />
        <PairList
          title="Overlapping (Redundant Risk)"
          pairs={overlapping}
          tone="warning"
        />
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <LegendItem cls="bg-success/40" label="Negative (diversified)" />
        <LegendItem cls="bg-info/30" label="Low" />
        <LegendItem cls="bg-muted/40" label="Neutral" />
        <LegendItem cls="bg-warning/30" label="Moderate" />
        <LegendItem cls="bg-destructive/50" label="High (redundant)" />
      </div>
    </ChartCard>
  );
}

function PairList({
  title,
  pairs,
  tone,
}: {
  title: string;
  pairs: { a: string; b: string; score: number }[];
  tone: "success" | "warning";
}) {
  return (
    <div>
      <span className="label-caps mb-1.5 block">{title}</span>
      <div className="space-y-1">
        {pairs.map((pair) => (
          <div key={`${pair.a}-${pair.b}`} className="flex items-center justify-between text-xs">
            <span>
              {pair.a} × {pair.b}
            </span>
            <span
              className={cn(
                "font-numeric font-medium",
                tone === "success" ? "text-success" : "text-warning",
              )}
            >
              {pair.score.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendItem({ cls, label }: { cls: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn("size-2.5 rounded-[2px]", cls)} />
      <span>{label}</span>
    </div>
  );
}
