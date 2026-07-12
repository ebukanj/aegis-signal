"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, ArrowDownRight, Bot, Target, ShieldAlert, Clock } from "lucide-react";
import { formatPrice, formatPercent } from "@/lib/format";
import type { PaperPosition } from "../types";

interface PositionDrawerProps {
  position: PaperPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PositionDrawer({ position, open, onOpenChange }: PositionDrawerProps) {
  if (!position) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-2xl">
              {position.direction === "LONG" ? (
                <ArrowUpRight className="text-long size-6" />
              ) : (
                <ArrowDownRight className="text-short size-6" />
              )}
              {position.coin}
            </SheetTitle>
            <Badge variant="outline" className={
              position.status === "IN_PROFIT" ? "border-success text-success" : 
              position.status === "IN_LOSS" ? "border-destructive text-destructive" : ""
            }>
              {position.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {position.strategy} • Open for {position.durationHours}h
          </p>
        </SheetHeader>

        <div className="space-y-6">
          {/* Main PnL */}
          <div className="rounded-lg bg-muted/50 p-6 text-center">
            <p className="text-sm font-medium text-muted-foreground mb-1">Unrealized PnL</p>
            <p className={`text-4xl font-bold font-numeric ${position.unrealizedPnL >= 0 ? "text-success" : "text-destructive"}`}>
              {position.unrealizedPnL >= 0 ? "+" : ""}{formatPrice(position.unrealizedPnL)}
            </p>
            <p className={`text-sm mt-1 font-numeric ${position.unrealizedPnL >= 0 ? "text-success/80" : "text-destructive/80"}`}>
              {position.unrealizedPnL >= 0 ? "+" : ""}{formatPercent(position.unrealizedPnLPct)}
            </p>
          </div>

          <Separator />

          {/* Execution Details */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Execution Details</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Entry Price</p>
                <p className="font-numeric font-medium">{formatPrice(position.entryPrice)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current Price</p>
                <p className="font-numeric font-medium">{formatPrice(position.currentPrice)}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1"><ShieldAlert className="size-3"/> Stop Loss</p>
                <p className="font-numeric font-medium text-destructive">{formatPrice(position.stopLoss)}</p>
              </div>
              <div>
                <p className="text-muted-foreground flex items-center gap-1"><Target className="size-3"/> Take Profit</p>
                <p className="font-numeric font-medium text-success">{formatPrice(position.takeProfit)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Risk Amount</p>
                <p className="font-numeric font-medium">{formatPrice(position.riskAmount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Position Size</p>
                <p className="font-numeric font-medium">{position.size} {position.coin}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* AI Commentary */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="size-4 text-primary" />
              <h4 className="text-sm font-semibold">AI Assistant</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {position.aiCommentary}
            </p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confidence</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${position.confidence}%` }} />
                </div>
                <span className="font-numeric">{position.confidence}%</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 pt-4">
            <Button variant="outline" className="w-full">Edit Targets</Button>
            <Button variant="destructive" className="w-full">Close Position</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
