"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { GitCompareArrows } from "lucide-react";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { SIGNAL_OUTCOME_META } from "@/constants/domain";
import type { SimilarSignal } from "@/features/signals/types";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const columns: ColumnDef<SimilarSignal>[] = [
  {
    accessorKey: "closedAt",
    header: "Date",
    cell: ({ row }) => (
      <span className="font-numeric text-xs text-muted-foreground">
        {formatShortDate(row.original.closedAt)}
      </span>
    ),
  },
  {
    accessorKey: "coin",
    header: "Coin",
    cell: ({ row }) => <span className="font-medium">{row.original.coin}</span>,
  },
  {
    accessorKey: "strategy",
    header: "Strategy",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.strategy}</span>
    ),
  },
  {
    accessorKey: "outcome",
    header: "Outcome",
    cell: ({ row }) => {
      const meta = SIGNAL_OUTCOME_META[row.original.outcome];
      return <StatusBadge status={meta.status}>{meta.label}</StatusBadge>;
    },
  },
  {
    accessorKey: "returnR",
    header: "Return",
    cell: ({ row }) => {
      const value = row.original.returnR;
      return (
        <span
          className={cn(
            "font-numeric",
            value > 0 && "text-long",
            value < 0 && "text-short",
          )}
        >
          {value > 0 ? "+" : ""}
          {value} R
        </span>
      );
    },
  },
  {
    accessorKey: "holdingHours",
    header: "Held",
    cell: ({ row }) => (
      <span className="font-numeric text-muted-foreground">
        {row.original.holdingHours}h
      </span>
    ),
  },
  {
    accessorKey: "confidence",
    header: "Confidence",
    cell: ({ row }) => <ConfidenceBadge score={row.original.confidence} />,
  },
];

/**
 * Answers: "How did signals like this one actually end?"
 * Closed signals from the same strategy — losses included, never hidden.
 */
export function SimilarSignalsTable({
  signals,
  className,
}: {
  signals: SimilarSignal[];
  className?: string;
}) {
  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center gap-2">
        <GitCompareArrows className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">
          Similar Historical Signals
        </h2>
      </div>
      <DataTable
        columns={columns}
        data={signals}
        emptyTitle="No comparable history yet"
        emptyDescription="Closed signals from this strategy will appear here."
      />
    </Card>
  );
}
