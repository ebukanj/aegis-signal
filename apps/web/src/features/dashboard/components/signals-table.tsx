"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Zap } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RISK_META } from "@/constants/domain";
import type { DashboardSignal } from "@/features/dashboard/types";
import { useHighConfidenceSignals } from "@/features/dashboard/hooks/use-dashboard-data";
import { formatDateTime, formatPrice, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const columns: ColumnDef<DashboardSignal>[] = [
  {
    accessorKey: "pair",
    header: "Coin",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.coin}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.pair} · {row.original.exchange}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "direction",
    header: "Direction",
    cell: ({ row }) => <DirectionBadge direction={row.original.direction} />,
  },
  {
    id: "strategy",
    accessorFn: (row) => row.strategies.join(", "),
    header: "Strategy",
    cell: ({ row }) => {
      const [primary, ...rest] = row.original.strategies;
      return (
        <span className="text-muted-foreground">
          {primary}
          {rest.length > 0 && (
            <span className="text-info"> +{rest.length}</span>
          )}
        </span>
      );
    },
  },
  {
    accessorKey: "confidence",
    header: "Confidence",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Progress
          value={row.original.confidence}
          className="h-1.5 w-16"
          aria-label={`Confidence ${row.original.confidence} out of 100`}
        />
        <span className="font-numeric text-sm">{row.original.confidence}</span>
      </div>
    ),
  },
  {
    accessorKey: "riskLevel",
    header: "Risk",
    cell: ({ row }) => {
      const meta = RISK_META[row.original.riskLevel];
      return <StatusBadge status={meta.status}>{meta.label}</StatusBadge>;
    },
  },
  {
    accessorKey: "entryPrice",
    header: "Entry",
    cell: ({ row }) => (
      <span className="font-numeric">{formatPrice(row.original.entryPrice)}</span>
    ),
  },
  {
    accessorKey: "generatedAt",
    header: "Time",
    cell: ({ row }) => (
      <span
        className="font-numeric text-xs text-muted-foreground"
        title={formatDateTime(row.original.generatedAt)}
      >
        {formatRelativeTime(row.original.generatedAt)}
      </span>
    ),
  },
];

/**
 * Answers: "Which opportunities deserve my attention right now?"
 * Highest-confidence validated signals, newest first.
 */
export function SignalsTable({ className }: { className?: string }) {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useHighConfidenceSignals();

  if (isError) {
    return (
      <ErrorState
        title="Signals unavailable"
        description="The signal feed could not be loaded."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">
            Today&apos;s Prime Signals
          </h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/signals">
            View all <ArrowRight />
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isPending}
        onRowClick={(signal) => router.push(`/signals/${signal.id}`)}
        emptyTitle="No prime signals yet today"
        emptyDescription="The platform publishes at most a handful of prime signals per day, whenever conditions are truly met. No signal is the system protecting you."
      />
    </Card>
  );
}
