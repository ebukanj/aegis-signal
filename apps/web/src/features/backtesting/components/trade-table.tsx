"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";
import type { BacktestTrade } from "../types";

interface TradeTableProps {
  trades: BacktestTrade[];
  onRowClick: (trade: BacktestTrade) => void;
  className?: string;
}

const PAGE_SIZE = 10;

/**
 * Historical Trade Table for backtesting results.
 * Supports pagination and clicking to view trade details.
 */
export function TradeTable({ trades, onRowClick, className }: TradeTableProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(trades.length / PAGE_SIZE);
  const currentTrades = trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card className={className}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="font-semibold tracking-tight">Historical Trades</h3>
          <p className="text-sm text-muted-foreground">Complete log of all simulated executions</p>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Pair</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">Return (R)</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentTrades.map((trade) => (
              <TableRow 
                key={trade.id} 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onRowClick(trade)}
              >
                <TableCell className="font-numeric text-muted-foreground">{trade.tradeNumber}</TableCell>
                <TableCell className="whitespace-nowrap font-numeric">
                  {format(new Date(trade.date), "MMM dd, HH:mm")}
                </TableCell>
                <TableCell className="font-medium">{trade.pair}</TableCell>
                <TableCell>
                  <Badge variant={trade.direction === "LONG" ? "default" : "secondary"} className="h-5 text-[10px]">
                    {trade.direction === "LONG" ? <ArrowUpRight className="mr-1 size-3" /> : <ArrowDownRight className="mr-1 size-3" />}
                    {trade.direction}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-numeric">
                  {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(trade.entryPrice)}
                </TableCell>
                <TableCell className="text-right font-numeric">
                  {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(trade.exitPrice)}
                </TableCell>
                <TableCell className={`text-right font-numeric font-medium ${trade.pnlDollar > 0 ? "text-success" : "text-destructive"}`}>
                  {trade.pnlDollar > 0 ? "+" : ""}{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(trade.pnlDollar)}
                </TableCell>
                <TableCell className={`text-right font-numeric ${trade.returnR > 0 ? "text-success" : "text-destructive"}`}>
                  {trade.returnR > 0 ? "+" : ""}{trade.returnR.toFixed(2)}R
                </TableCell>
                <TableCell className="text-right font-numeric text-muted-foreground">
                  {trade.holdingHours < 24 ? `${trade.holdingHours.toFixed(1)}h` : `${(trade.holdingHours / 24).toFixed(1)}d`}
                </TableCell>
              </TableRow>
            ))}
            {currentTrades.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No trades found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t px-6 py-3">
        <span className="text-sm text-muted-foreground">
          Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, trades.length)} of {trades.length}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
