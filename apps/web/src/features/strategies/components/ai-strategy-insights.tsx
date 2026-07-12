"use client";

import {
  AlertTriangle,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { RadialProgress } from "@/components/shared/radial-progress";
import { useStrategyAIInsight } from "@/features/strategies/hooks/use-strategies";
import { cn } from "@/lib/utils";

function InsightList({
  title,
  icon: Icon,
  items,
  tone,
}: {
  title: string;
  icon: typeof ThumbsUp;
  items: string[];
  tone?: "success" | "error" | "warning";
}) {
  return (
    <div className="space-y-2">
      <p
        className={cn(
          "label-caps flex items-center gap-1.5",
          tone === "success" && "text-success",
          tone === "error" && "text-destructive",
          tone === "warning" && "text-warning",
        )}
      >
        <Icon className="size-3.5" aria-hidden /> {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * AI strategy analysis — assistant commentary only; it never changes
 * strategy logic or allocation (Founding Principle 9). Mock content until
 * the AI Gateway ships.
 */
export function AIStrategyInsights({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const { data, isPending, isError, refetch } = useStrategyAIInsight(slug);

  if (isError) {
    return (
      <ErrorState
        title="AI insights unavailable"
        description="The AI layer could not be reached. Strategy data above is unaffected."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold tracking-tight">
            AI Strategy Insights
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Assistant analysis — never part of allocation decisions
        </p>
      </div>

      {isPending ? (
        <div className="space-y-3" aria-label="AI insights loading">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <RadialProgress
              value={data.currentSuitability.score}
              size={80}
              label={`Current suitability ${data.currentSuitability.score} out of 100`}
              className="shrink-0"
            />
            <div className="space-y-2">
              <p className="text-sm leading-relaxed">{data.summary}</p>
              <p className="text-sm text-muted-foreground">
                {data.currentSuitability.note}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <InsightList
              title="Strengths"
              icon={ThumbsUp}
              items={data.strengths}
              tone="success"
            />
            <InsightList
              title="Weaknesses"
              icon={ThumbsDown}
              items={data.weaknesses}
              tone="error"
            />
            <InsightList
              title="Suggested Improvements"
              icon={Wrench}
              items={data.suggestedImprovements}
            />
            <InsightList
              title="Potential Risks"
              icon={AlertTriangle}
              items={data.potentialRisks}
              tone="warning"
            />
          </div>

          <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <span className="label-caps mr-2">Recommended markets</span>
            {data.recommendedMarkets}
          </p>
        </div>
      )}
    </Card>
  );
}
