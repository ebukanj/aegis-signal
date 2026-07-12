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
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { formatPrice, formatPercent } from "@/lib/format";
import type { PaperTrade } from "../types";

export function ClosedTrades({ trades, className }: { trades: PaperTrade[], className?: string }) {
  const [search, setSearch] = useState("");

  const filtered = trades.filter((t) => 
    t.coin.toLowerCase().includes(search.toLowerCase()) ||
    t.strategy.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className={className}>
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <h3 className="font-semibold whitespace-nowrap">Trade History</h3>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input 
            placeholder="Search coin or strategy..." 
            className="pl-8" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">R-Multi</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell className="font-medium">{trade.coin}</TableCell>
                <TableCell className="text-muted-foreground">{trade.strategy}</TableCell>
                <TableCell>
                  <span className={trade.direction === "LONG" ? "text-long" : "text-short"}>
                    {trade.direction}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className={`font-numeric ${trade.realizedPnL >= 0 ? "text-success" : "text-destructive"}`}>
                    {trade.realizedPnL >= 0 ? "+" : ""}{formatPrice(trade.realizedPnL)}
                  </div>
                </TableCell>
                <TableCell className="text-right font-numeric text-muted-foreground">
                  {trade.returnR >= 0 ? "+" : ""}{trade.returnR.toFixed(2)}R
                </TableCell>
                <TableCell className="text-right font-numeric text-muted-foreground">
                  {trade.durationHours}h
                </TableCell>
                <TableCell>
                  <Badge variant={trade.outcome === "WIN" ? "default" : trade.outcome === "LOSS" ? "destructive" : "secondary"}>
                    {trade.outcome}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No trades found matching &ldquo;{search}&rdquo;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
