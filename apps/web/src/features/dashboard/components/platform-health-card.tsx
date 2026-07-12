"use client";

import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_STATUS_META } from "@/constants/domain";
import { usePlatformHealth } from "@/features/dashboard/hooks/use-dashboard-data";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Answers: "Can I trust the data I'm seeing right now?"
 * Scanner, exchange connectivity, workers, and notification delivery.
 */
export function PlatformHealthCard({ className }: { className?: string }) {
  const { data, isPending, isError, refetch } = usePlatformHealth();

  if (isError) {
    return (
      <ErrorState
        title="Health feed unavailable"
        description="Platform health could not be loaded."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  if (isPending) {
    return (
      <Card className={cn("gap-3 p-4 md:p-5", className)}>
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </Card>
    );
  }

  const scanner = SERVICE_STATUS_META[data.scanner];
  const notifications = SERVICE_STATUS_META[data.notifications];

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Platform Health</h2>
        <span className="text-xs text-muted-foreground">
          Last scan {formatRelativeTime(data.lastScanAt)}
        </span>
      </div>

      <div className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Market Scanner</span>
          <StatusBadge status={scanner.status}>
            {scanner.label} · <span className="font-numeric">{data.scannerPairs}</span> pairs
          </StatusBadge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Workers</span>
          <StatusBadge
            status={data.workers.healthy === data.workers.total ? "success" : "warning"}
          >
            <span className="font-numeric">
              {data.workers.healthy}/{data.workers.total}
            </span>{" "}
            healthy
          </StatusBadge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Notifications</span>
          <StatusBadge status={notifications.status}>
            {notifications.label}
          </StatusBadge>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="label-caps">Exchanges</p>
        <ul className="space-y-1.5">
          {data.exchanges.map((exchange) => {
            const meta = SERVICE_STATUS_META[exchange.status];
            return (
              <li
                key={exchange.name}
                className="flex items-center justify-between text-sm"
              >
                <span>{exchange.name}</span>
                <span className="flex items-center gap-2">
                  <span className="font-numeric text-xs text-muted-foreground">
                    {exchange.latencyMs}ms
                  </span>
                  <StatusBadge status={meta.status}>{meta.label}</StatusBadge>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
