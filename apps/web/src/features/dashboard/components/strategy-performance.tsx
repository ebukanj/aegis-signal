"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical, TrendingDown, TrendingUp } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrategyHealth } from "@/features/dashboard/hooks/use-dashboard-data";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Answers: "Which strategies are earning trust, and which are losing it?"
 * Strategies compete — best and weakest are always visible (Principle 5).
 */
export function StrategyPerformance({ className }: { className?: string }) {
  const { data, isPending, isError, refetch } = useStrategyHealth();

  if (isError) {
    return (
      <ErrorState
        title="Strategy health unavailable"
        description="Strategy performance could not be loaded."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  if (isPending) {
    return (
      <Card className={cn("gap-3 p-4 md:p-5", className)}>
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">
            Strategy Performance
          </h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/strategies">
            Laboratory <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="label-caps">Best Strategy</span>
            <TrendingUp className="size-4 text-success" aria-hidden />
          </div>
          <p className="mt-1.5 text-sm font-medium">{data.best.name}</p>
          <p className="font-numeric mt-0.5 text-xs text-muted-foreground">
            Expectancy{" "}
            <span className="text-success">+{data.best.expectancy.toFixed(2)}R</span>{" "}
            · Win rate {formatPercent(data.best.winRate, false)}
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="label-caps">Weakest Strategy</span>
            <TrendingDown className="size-4 text-destructive" aria-hidden />
          </div>
          <p className="mt-1.5 text-sm font-medium">{data.weakest.name}</p>
          <p className="font-numeric mt-0.5 text-xs text-muted-foreground">
            Expectancy{" "}
            <span className="text-destructive">
              {data.weakest.expectancy.toFixed(2)}R
            </span>{" "}
            · Win rate {formatPercent(data.weakest.winRate, false)}
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <span className="label-caps">Active Strategies</span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-numeric text-xl font-semibold">{data.active}</span>
            <StatusBadge status="success">Competing</StatusBadge>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <span className="label-caps">Disabled Strategies</span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-numeric text-xl font-semibold">{data.disabled}</span>
            <StatusBadge status="neutral">Benched</StatusBadge>
          </div>
        </div>
      </div>
    </Card>
  );
}
