"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  MoreHorizontal,
  Share2,
  Star,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  OPPORTUNITY_STATUS_META,
  REGIME_META,
  RISK_META,
} from "@/constants/domain";
import type { Opportunity } from "@/features/scanner/types";
import { copyOpportunity } from "@/features/scanner/utils";
import { formatDateTime, formatPrice, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OpportunityTableProps {
  opportunities: Opportunity[];
  loading: boolean;
  onPreview: (opportunity: Opportunity) => void;
}

/** Responsive visibility per column, applied to both header and cells. */
const COLUMN_CLASS: Record<string, string> = {
  rank: "w-12",
  strategy: "hidden lg:table-cell",
  timeframe: "hidden xl:table-cell",
  stopLoss: "hidden xl:table-cell",
  takeProfit: "hidden xl:table-cell",
  regime: "hidden 2xl:table-cell",
  generatedAt: "hidden md:table-cell",
  status: "hidden md:table-cell",
};

function buildColumns(
  onPreview: (opp: Opportunity) => void,
): ColumnDef<Opportunity>[] {
  return [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked === true)
          }
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${row.original.pair}`}
        />
      ),
    },
    {
      accessorKey: "rank",
      header: "#",
      cell: ({ row }) => (
        <span className="font-numeric text-xs text-muted-foreground">
          {row.original.rank}
        </span>
      ),
    },
    {
      accessorKey: "coin",
      header: "Coin",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="flex items-center gap-1 font-medium">
            {row.original.coin}
            {row.original.isPrime && (
              <Zap
                className="size-3.5 fill-warning text-warning"
                aria-label="Prime signal"
              />
            )}
          </span>
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
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{primary}</span>
            {rest.length > 0 && (
              <StatusBadge
                status="info"
                dot={false}
                aria-label={`Confluence with ${rest.join(" and ")}`}
                title={rest.join(" + ")}
              >
                +{rest.length}
              </StatusBadge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "timeframe",
      header: "Setup",
      cell: ({ row }) => (
        <span className="font-numeric text-xs">
          {row.original.timeframe} ·{" "}
          {row.original.marketType === "SPOT"
            ? "Spot"
            : `${row.original.suggestedLeverage}x`}
        </span>
      ),
    },
    {
      accessorKey: "confidence",
      header: "Confidence",
      cell: ({ row }) => <ConfidenceBadge confidence={row.original.confidence} />,
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
      accessorKey: "stopLoss",
      header: "Stop",
      cell: ({ row }) => (
        <span className="font-numeric text-short">
          {formatPrice(row.original.stopLoss)}
        </span>
      ),
    },
    {
      accessorKey: "takeProfit",
      header: "Target",
      cell: ({ row }) => (
        <span className="font-numeric text-long">
          {formatPrice(row.original.takeProfit)}
        </span>
      ),
    },
    {
      accessorKey: "regime",
      header: "Regime",
      cell: ({ row }) => {
        const meta = REGIME_META[row.original.regime];
        return <StatusBadge status={meta.status}>{meta.label}</StatusBadge>;
      },
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
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const meta = OPPORTUNITY_STATUS_META[row.original.status];
        return <StatusBadge status={meta.status}>{meta.label}</StatusBadge>;
      },
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Actions for ${row.original.pair}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem onSelect={() => onPreview(row.original)}>
              <Eye /> View details
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Watchlist arrives with user preferences.")
              }
            >
              <Star /> Add to watchlist
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => copyOpportunity(row.original)}>
              <Copy /> Copy signal
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                toast.info("Sharing arrives with notification channels.")
              }
            >
              <Share2 /> Share
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

/**
 * Ranked opportunity table: sorting, column visibility, row selection,
 * sticky header, pagination, keyboard navigation (Enter opens preview).
 * Client-side pagination is a stand-in for server-side pagination; the
 * markup and state shape stay identical when the API takes over.
 */
export function OpportunityTable({
  opportunities,
  loading,
  onPreview,
}: OpportunityTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data: opportunities,
    columns: buildColumns(onPreview),
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  if (loading) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <EmptyState
        title="No opportunities match your filters"
        description="Loosen the filters, or wait for the next scan — quality thresholds reject most of the market by design."
      />
    );
  }

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="space-y-2">
      {/* Table controls */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" role="status">
          {selectedCount > 0
            ? `${selectedCount} selected`
            : `${opportunities.length} opportunities`}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Toggle columns
            </DropdownMenuLabel>
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(checked)}
                  className="capitalize"
                >
                  {column.id === "generatedAt" ? "Time" : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sticky-header table: this wrapper is the single scroll container for
          both axes, so the header sticks and wide content scrolls in place */}
      <div className="max-h-[65vh] min-w-0 overflow-auto rounded-lg border [&_[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={COLUMN_CLASS[header.column.id]}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="label-caps inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        <span className="label-caps">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={() => onPreview(row.original)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPreview(row.original);
                  }
                }}
                className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Preview ${row.original.pair} ${row.original.direction}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={COLUMN_CLASS[cell.column.id]}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows</span>
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size="sm" className="w-17" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-numeric text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(table.getPageCount(), 1)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className={cn("size-7")}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
