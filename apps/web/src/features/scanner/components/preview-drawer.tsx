"use client";

import Link from "next/link";
import { ArrowRight, CandlestickChart, Copy, Share2, Star } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  OPPORTUNITY_STATUS_META,
  REGIME_META,
  RISK_META,
} from "@/constants/domain";
import type { Opportunity } from "@/features/scanner/types";
import { copyOpportunity } from "@/features/scanner/utils";
import { formatDateTime, formatPrice, formatRelativeTime } from "@/lib/format";
import { buildTradeInstruction } from "@/lib/trade-instruction";

interface PreviewDrawerProps {
  opportunity: Opportunity | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quick signal preview without leaving the scanner.
 * Full analysis lives on the Signal Intelligence page (Milestone 04).
 */
export function PreviewDrawer({ opportunity, onOpenChange }: PreviewDrawerProps) {
  const opp = opportunity;

  return (
    <Sheet open={opp !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {opp && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="text-base">
                  {opp.pair}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {opp.exchange} · {opp.timeframe}
                  </span>
                </SheetTitle>
                <DirectionBadge direction={opp.direction} />
              </div>
              <SheetDescription>
                {opp.strategies.join(" + ")} · generated{" "}
                {formatRelativeTime(opp.generatedAt)} ·{" "}
                {formatDateTime(opp.generatedAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-4">
              {/* Execution instruction — how to act on this signal */}
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                <p className="label-caps text-primary">How to execute</p>
                <p className="mt-1 text-sm font-medium">
                  {buildTradeInstruction(opp)}
                </p>
              </div>

              {/* Status chips */}
              <div className="flex flex-wrap gap-1.5">
                {opp.isPrime && (
                  <StatusBadge status="warning" dot={false}>
                    ★ Prime
                  </StatusBadge>
                )}
                <StatusBadge status={OPPORTUNITY_STATUS_META[opp.status].status}>
                  {OPPORTUNITY_STATUS_META[opp.status].label}
                </StatusBadge>
                <StatusBadge status={REGIME_META[opp.regime].status}>
                  {REGIME_META[opp.regime].label}
                </StatusBadge>
                <StatusBadge status={RISK_META[opp.riskLevel].status}>
                  {RISK_META[opp.riskLevel].label} risk
                </StatusBadge>
              </div>

              {/* Confidence */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="label-caps">Confidence</span>
                  <ConfidenceBadge confidence={opp.confidence} />
                </div>
                <Progress
                  value={opp.confidence}
                  className="h-1.5"
                  aria-label={`Confidence ${opp.confidence} out of 100`}
                />
              </div>

              <Separator />

              {/* Trade parameters */}
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Entry</dt>
                  <dd className="font-numeric">{formatPrice(opp.entryPrice)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Stop Loss</dt>
                  <dd className="font-numeric text-short">
                    {formatPrice(opp.stopLoss)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Take Profit</dt>
                  <dd className="font-numeric text-long">
                    {formatPrice(opp.takeProfit)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Risk / Reward</dt>
                  <dd className="font-numeric">1 : {opp.rewardRisk}</dd>
                </div>
              </dl>

              <Separator />

              {/* Mini chart placeholder — Lightweight Charts arrives with live data */}
              <div
                className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-muted-foreground"
                role="img"
                aria-label="Chart preview placeholder"
              >
                <CandlestickChart className="size-5" aria-hidden />
                <span className="text-xs">Chart preview arrives with live data</span>
              </div>

              {/* Explanation placeholder — full explainability in Signal Intelligence */}
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
                <span className="label-caps">Why this signal exists</span>
                <p className="text-sm text-muted-foreground">
                  {opp.strategies.join(" + ")} conditions satisfied on the {opp.timeframe}{" "}
                  timeframe in a {REGIME_META[opp.regime].label.toLowerCase()}{" "}
                  regime. The full breakdown — conditions, filters, confidence
                  contributors, and risk assessment — lives on the Signal
                  Intelligence page.
                </p>
              </div>
            </div>

            <SheetFooter className="mt-auto border-t">
              <Button asChild className="w-full">
                <Link href={`/signals/${opp.id}`}>
                  Full signal intelligence <ArrowRight />
                </Link>
              </Button>
              <div className="grid w-full grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => copyOpportunity(opp)}>
                  <Copy /> Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast.info("Watchlist arrives with user preferences.")
                  }
                >
                  <Star /> Watch
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast.info("Sharing arrives with notification channels.")
                  }
                >
                  <Share2 /> Share
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
