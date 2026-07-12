"use client";

import { Eye, Lightbulb, ShieldQuestion, Sparkles, XOctagon } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAICommentary } from "@/features/signals/hooks/use-signal-detail";
import { cn } from "@/lib/utils";

/**
 * Answers: "What does AI make of the current context?"
 * AI explains and contextualizes — it never generated the signal and never
 * overrides deterministic logic (Founding Principle 9). Mock responses until
 * the AI Gateway ships.
 */
export function AICommentary({
  signalId,
  className,
}: {
  signalId: string;
  className?: string;
}) {
  const { data, isPending, isError, refetch } = useAICommentary(signalId, true);

  if (isError) {
    return (
      <ErrorState
        title="AI commentary unavailable"
        description="The AI layer could not be reached. The signal itself is unaffected — AI never gates deterministic output."
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
          <h2 className="text-sm font-semibold tracking-tight">
            AI Market Commentary
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Assistant analysis — informational only, never part of signal generation
        </p>
      </div>

      {isPending ? (
        <div className="space-y-3" aria-label="AI commentary loading">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>{data.marketSummary}</p>
            <p className="text-muted-foreground">{data.signalExplanation}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {data.scenarios.map((scenario) => (
              <div key={scenario.title} className="rounded-lg border p-3">
                <p className="label-caps flex items-center gap-1.5">
                  <Lightbulb className="size-3.5" aria-hidden /> {scenario.title}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {scenario.detail}
                </p>
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="label-caps flex items-center gap-1.5">
                <ShieldQuestion className="size-3.5" aria-hidden /> Risk view
              </p>
              <p className="text-sm text-muted-foreground">
                {data.riskCommentary}
              </p>
            </div>
            <div className="space-y-2">
              <p className="label-caps flex items-center gap-1.5">
                <XOctagon className="size-3.5" aria-hidden /> What invalidates it
              </p>
              <ul className="space-y-1.5">
                {data.invalidations.map((item) => (
                  <li key={item} className="text-sm text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="label-caps flex items-center gap-1.5">
                <Eye className="size-3.5" aria-hidden /> What to monitor
              </p>
              <ul className="space-y-1.5">
                {data.monitor.map((item) => (
                  <li key={item} className="text-sm text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
