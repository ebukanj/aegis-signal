import { Card } from "@/components/ui/card";
import type { StrategyProfile } from "@/features/strategies/types";
import { COMPATIBILITY_DIMENSIONS } from "@/features/strategies/types";
import { cn } from "@/lib/utils";

function barTone(value: number): string {
  if (value >= 70) return "bg-success";
  if (value >= 45) return "bg-warning";
  return "bg-destructive/70";
}

/** Answers: "Which market is this strategy built for?" */
export function MarketCompatibility({
  strategy,
  className,
}: {
  strategy: StrategyProfile;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <h3 className="text-sm font-semibold tracking-tight">
        Market Compatibility
      </h3>
      <ul className="space-y-2.5">
        {COMPATIBILITY_DIMENSIONS.map((dimension) => {
          const value = strategy.compatibility[dimension];
          return (
            <li key={dimension} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>{dimension}</span>
                <span className="font-numeric text-muted-foreground">
                  {value}
                </span>
              </div>
              <div
                role="meter"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${dimension} compatibility ${value} out of 100`}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn("h-full rounded-full", barTone(value))}
                  style={{ width: `${value}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        The Breakout allocator uses these ratings with live expectancy to
        decide which strategies trade in the current regime.
      </p>
    </Card>
  );
}
