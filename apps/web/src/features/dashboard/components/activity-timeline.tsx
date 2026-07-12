"use client";

import { Bell, FlaskConical, ServerCog, Zap, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTIVITY_KIND_META } from "@/constants/domain";
import type { ActivityKind } from "@/features/dashboard/types";
import { useRecentActivity } from "@/features/dashboard/hooks/use-dashboard-data";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<ActivityKind, LucideIcon> = {
  SIGNAL: Zap,
  STRATEGY_CHANGE: FlaskConical,
  NOTIFICATION: Bell,
  SYSTEM: ServerCog,
};

/**
 * Answers: "What has the platform done recently?"
 * Signals, strategy changes, alerts, and system events in one feed.
 */
export function ActivityTimeline({ className }: { className?: string }) {
  const { data, isPending, isError, refetch } = useRecentActivity();

  if (isError) {
    return (
      <ErrorState
        title="Activity unavailable"
        description="The activity feed could not be loaded."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <h2 className="text-sm font-semibold tracking-tight">Recent Activity</h2>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title="No recent activity"
          description="Platform events will appear here as they happen."
          className="border-0 p-6"
        />
      ) : (
        <ol className="space-y-0.5">
          {data.map((event, index) => {
            const Icon = KIND_ICONS[event.kind];
            const isLast = index === data.length - 1;
            return (
              <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className="absolute left-3.5 top-8 h-[calc(100%-1.75rem)] w-px bg-border"
                  />
                )}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <span className="font-numeric shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(event.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className="label-caps mr-1.5">
                      {ACTIVITY_KIND_META[event.kind].label}
                    </span>
                    {event.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
