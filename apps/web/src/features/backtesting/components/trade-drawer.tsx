"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Brain, FileText, Target, Activity, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";
import type { BacktestTrade } from "../types";

interface TradeDrawerProps {
  trade: BacktestTrade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Slide-out drawer to view full details of a specific simulated trade.
 */
export function TradeDrawer({ trade, open, onOpenChange }: TradeDrawerProps) {
  if (!trade) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center justify-between">
            <Badge variant={trade.direction === "LONG" ? "default" : "secondary"}>
              {trade.direction === "LONG" ? <ArrowUpRight className="mr-1 size-3" /> : <ArrowDownRight className="mr-1 size-3" />}
              {trade.direction}
            </Badge>
            <Badge variant={trade.outcome === "WIN" ? "default" : "destructive"}>
              {trade.outcome}
            </Badge>
          </div>
          <SheetTitle className="text-xl">Trade #{trade.tradeNumber}</SheetTitle>
          <SheetDescription>
            {trade.pair} · {format(new Date(trade.date), "MMM d, yyyy HH:mm")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Chart Placeholder */}
          <div className="flex h-48 w-full items-center justify-center rounded-lg border border-dashed bg-muted/20">
            <span className="text-sm text-muted-foreground">[ TradingView Chart Snapshot Placeholder ]</span>
          </div>

          {/* Execution Details */}
          <div className="grid grid-cols-2 gap-4">
            <MetricBox label="Entry Price" value={trade.entryPrice} isCurrency />
            <MetricBox label="Exit Price" value={trade.exitPrice} isCurrency />
            <MetricBox label="Net PnL" value={trade.pnlDollar} isCurrency isSigned />
            <MetricBox label="Return Multiple" value={trade.returnR} suffix="R" isSigned />
            <MetricBox label="Duration" value={`${trade.holdingHours.toFixed(1)} hours`} />
            <MetricBox label="Market Regime" value={trade.regime.replace("_", " ")} />
          </div>

          <Separator />

          {/* AI & Context */}
          <div className="space-y-4">
            <div>
              <h4 className="flex items-center text-sm font-semibold text-foreground mb-2">
                <Target className="mr-2 size-4 text-primary" />
                Signal Explanation
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{trade.signalExplanation}</p>
            </div>
            
            <div>
              <h4 className="flex items-center text-sm font-semibold text-foreground mb-2">
                <Activity className="mr-2 size-4 text-primary" />
                Risk Summary
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{trade.riskSummary}</p>
            </div>

            <div className="rounded-lg border bg-primary/5 p-4">
              <h4 className="flex items-center text-sm font-semibold text-primary mb-2">
                <Brain className="mr-2 size-4" />
                AI Commentary
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                &ldquo;{trade.aiCommentary}&rdquo;
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetricBox({ 
  label, 
  value, 
  isCurrency = false, 
  isSigned = false,
  suffix = ""
}: { 
  label: string; 
  value: string | number; 
  isCurrency?: boolean; 
  isSigned?: boolean;
  suffix?: string;
}) {
  let displayValue = String(value);
  let color = "text-foreground";

  if (typeof value === "number") {
    if (isCurrency) {
      displayValue = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
    } else {
      displayValue = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
    }

    if (isSigned) {
      if (value > 0) {
        displayValue = `+${displayValue}`;
        color = "text-success";
      } else if (value < 0) {
        color = "text-destructive";
      }
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-numeric text-sm font-semibold ${color}`}>{displayValue}{suffix}</span>
    </div>
  );
}
