"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { ChartCard } from "@/components/shared/chart-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STRATEGY_STATUS_META } from "@/constants/domain";
import type { StrategyPerformanceRow, PerformanceTrend } from "../types";
import { cn } from "@/lib/utils";

function TrendIcon({ trend }: { trend: PerformanceTrend }) {
  if (trend === "IMPROVING")
    return <TrendingUp className="size-3.5 text-success" aria-label="Improving" />;
  if (trend === "DECLINING")
    return <TrendingDown className="size-3.5 text-destructive" aria-label="Declining" />;
  return <Minus className="size-3.5 text-muted-foreground" aria-label="Stable" />;
}

const columns: ColumnDef<StrategyPerformanceRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Strategy",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.original.name}</span>
        <TrendIcon trend={row.original.trend} />
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "winRate",
    header: "Win Rate",
    cell: ({ getValue }) => (
      <span className="font-numeric">{(getValue() as number).toFixed(1)}%</span>
    ),
  },
  {
    accessorKey: "profitFactor",
    header: "Profit Factor",
    cell: ({ getValue }) => (
      <span className="font-numeric">{(getValue() as number).toFixed(2)}</span>
    ),
  },
  {
    accessorKey: "expectancy",
    header: "Expectancy",
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return (
        <span className={cn("font-numeric", v >= 0 ? "text-success" : "text-destructive")}>
          {v >= 0 ? "+" : ""}
          {v.toFixed(3)}R
        </span>
      );
    },
  },
  {
    accessorKey: "avgReturnR",
    header: "Avg Return",
    cell: ({ getValue }) => (
      <span className="font-numeric">{(getValue() as number).toFixed(2)}R</span>
    ),
  },
  {
    accessorKey: "avgConfidence",
    header: "Avg Confidence",
    cell: ({ getValue }) => (
      <span className="font-numeric">{getValue() as number}</span>
    ),
  },
  {
    accessorKey: "maxDrawdown",
    header: "Drawdown",
    cell: ({ getValue }) => (
      <span className="font-numeric text-destructive">
        {(getValue() as number).toFixed(1)}%
      </span>
    ),
  },
  {
    accessorKey: "totalSignals",
    header: "Signals",
    cell: ({ getValue }) => (
      <span className="font-numeric">{(getValue() as number).toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue() as "ACTIVE" | "PROBATION" | "DISABLED";
      const meta = STRATEGY_STATUS_META[status];
      return <StatusBadge status={meta.status}>{meta.label}</StatusBadge>;
    },
    enableSorting: false,
  },
];

interface StrategyComparisonTableProps {
  strategies: StrategyPerformanceRow[];
  loading?: boolean;
  className?: string;
}

/**
 * Sortable strategy comparison table with trend indicators and status badges.
 */
export function StrategyComparisonTable({
  strategies,
  loading = false,
  className,
}: StrategyComparisonTableProps) {
  if (loading) {
    return (
      <ChartCard title="Strategy Comparison" className={className}>
        <Skeleton className="h-64 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Strategy Comparison" description="Compare all strategies by key metrics" className={className}>
      <DataTable
        columns={columns}
        data={strategies}
        emptyTitle="No strategies in this window"
        emptyDescription="Adjust filters to see strategy performance."
      />
    </ChartCard>
  );
}
