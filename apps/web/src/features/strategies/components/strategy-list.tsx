"use client";

import { EmptyState } from "@/components/shared/empty-state";
import { RadialProgress } from "@/components/shared/radial-progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StrategyStatusBadge } from "@/features/strategies/components/strategy-status-badge";
import type { StrategyProfile } from "@/features/strategies/types";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StrategyListProps {
  strategies: StrategyProfile[];
  loading: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  compareSlugs: string[];
  onToggleCompare: (slug: string) => void;
}

/** Browsable strategy explorer — one card per strategy. */
export function StrategyList({
  strategies,
  loading,
  selectedSlug,
  onSelect,
  compareSlugs,
  onToggleCompare,
}: StrategyListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <EmptyState
        title="No strategies match"
        description="Adjust the search or status filter."
      />
    );
  }

  return (
    <ul className="space-y-2" role="listbox" aria-label="Strategies">
      {strategies.map((strategy) => {
        const isSelected = strategy.slug === selectedSlug;
        const topCompat = Object.entries(strategy.compatibility).sort(
          (a, b) => b[1] - a[1],
        )[0][0];
        return (
          <li key={strategy.slug}>
            <div
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => onSelect(strategy.slug)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(strategy.slug);
                }
              }}
              className={cn(
                "cursor-pointer rounded-lg border bg-card p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary/50 bg-primary/[0.04]"
                  : "hover:bg-accent/40",
                strategy.status === "DISABLED" && "opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                    {strategy.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {strategy.className} ·{" "}
                    {strategy.market === "META" ? "Meta" : strategy.market.toLowerCase()}
                  </p>
                </div>
                <RadialProgress
                  value={strategy.health.score}
                  size={40}
                  strokeWidth={4}
                  label={`${strategy.name} health ${strategy.health.score} out of 100`}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StrategyStatusBadge status={strategy.status} />
                <span className="font-numeric text-xs text-muted-foreground">
                  WR {formatPercent(strategy.winRate, false)}
                </span>
                <span className="font-numeric text-xs text-muted-foreground">
                  · Conf {strategy.avgConfidence}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  · Best in {topCompat}
                </span>
                <label
                  className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    checked={compareSlugs.includes(strategy.slug)}
                    onCheckedChange={() => onToggleCompare(strategy.slug)}
                    aria-label={`Compare ${strategy.name}`}
                  />
                  Compare
                </label>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
