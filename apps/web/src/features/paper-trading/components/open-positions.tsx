"use client";

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
import { ArrowUpRight, ArrowDownRight, Settings2 } from "lucide-react";
import { formatPrice, formatPercent } from "@/lib/format";
import type { PaperPosition } from "../types";

interface OpenPositionsProps {
  positions: PaperPosition[];
  onRowClick: (position: PaperPosition) => void;
  className?: string;
}

export function OpenPositions({ positions, onRowClick, className }: OpenPositionsProps) {
  if (!positions.length) {
    return (
      <Card className={`p-8 text-center text-muted-foreground ${className}`}>
        No open positions.
      </Card>
    );
  }

  return (
    <Card className={className}>
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Open Positions</h3>
        <Badge variant="secondary">{positions.length} Active</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Risk</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos) => (
            <TableRow 
              key={pos.id} 
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(pos)}
            >
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {pos.direction === "LONG" ? (
                    <ArrowUpRight className="size-4 text-long" />
                  ) : (
                    <ArrowDownRight className="size-4 text-short" />
                  )}
                  {pos.coin}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-normal">{pos.strategy}</Badge>
              </TableCell>
              <TableCell className="text-right font-numeric">{formatPrice(pos.entryPrice)}</TableCell>
              <TableCell className="text-right font-numeric">{formatPrice(pos.currentPrice)}</TableCell>
              <TableCell className="text-right">
                <div className={`font-numeric font-medium ${pos.unrealizedPnL >= 0 ? "text-success" : "text-destructive"}`}>
                  {pos.unrealizedPnL >= 0 ? "+" : ""}{formatPrice(pos.unrealizedPnL)}
                  <span className="text-xs ml-1 opacity-75">({formatPercent(pos.unrealizedPnLPct)})</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-numeric text-muted-foreground">
                {formatPrice(pos.riskAmount)}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onRowClick(pos); }}>
                  <Settings2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
