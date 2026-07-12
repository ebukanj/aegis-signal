"use client";

import Link from "next/link";
import { ArrowRight, BellRing, Copy, Crosshair } from "lucide-react";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBestOpportunity } from "@/features/dashboard/hooks/use-dashboard-data";
import { copyOpportunity } from "@/features/scanner/utils";
import { formatDateTime, formatPrice, formatRelativeTime } from "@/lib/format";
import {
  buildTradeInstruction,
  tradeInstructionChip,
} from "@/lib/trade-instruction";

/**
 * The dashboard headline: the single best current opportunity with its full
 * trade instruction — actionable in seconds without opening another tool.
 * Prime signals are also pushed via in-app, Telegram, and WhatsApp alerts.
 */
export function BestOpportunityCard({ className }: { className?: string }) {
  const { data, isPending, isError, refetch } = useBestOpportunity();

  if (isError) {
    return (
      <ErrorState
        title="Best opportunity unavailable"
        description="The prime signal feed could not be loaded."
        onRetry={() => refetch()}
        className={className}
      />
    );
  }

  if (isPending) {
    return (
      <Card className={className ? `gap-3 p-4 md:p-5 ${className}` : "gap-3 p-4 md:p-5"}>
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={Crosshair}
        title="No prime signal right now"
        description="The platform publishes at most a handful of prime signals per day — none currently meets the bar. Patience is a position."
        className={className}
      />
    );
  }

  return (
    <Card className="relative gap-4 overflow-hidden border-primary/30 p-4 md:p-5">
      {/* Brand glow marks this as the most important card on the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/[0.08] blur-3xl"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="label-caps flex items-center gap-1.5 text-primary">
            <Crosshair className="size-3.5" aria-hidden /> Best opportunity right now
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
              {data.pair}
            </h2>
            <DirectionBadge direction={data.direction} />
            <StatusBadge status="warning" dot={false}>
              ★ Prime
            </StatusBadge>
            <ConfidenceBadge confidence={data.confidence} />
          </div>
          <p className="text-sm text-muted-foreground">
            {data.strategies.join(" + ")}
            {data.strategies.length > 1 && " · confluence"} · detected{" "}
            {formatRelativeTime(data.generatedAt)} ·{" "}
            <span className="font-numeric">{formatDateTime(data.generatedAt)}</span>
          </p>
        </div>

        <StatusBadge status="neutral" dot={false} className="font-numeric">
          {tradeInstructionChip(data)}
        </StatusBadge>
      </div>

      {/* The instruction a trader can act on immediately */}
      <p className="relative text-sm font-medium leading-relaxed md:text-base">
        {buildTradeInstruction(data)}
      </p>

      <div className="font-numeric relative grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-md border bg-card/60 px-3 py-2">
          <p className="label-caps">Entry</p>
          <p className="mt-0.5 font-medium">{formatPrice(data.entryPrice)}</p>
        </div>
        <div className="rounded-md border bg-card/60 px-3 py-2">
          <p className="label-caps">Stop</p>
          <p className="mt-0.5 font-medium text-short">
            {formatPrice(data.stopLoss)}
          </p>
        </div>
        <div className="rounded-md border bg-card/60 px-3 py-2">
          <p className="label-caps">Target</p>
          <p className="mt-0.5 font-medium text-long">
            {formatPrice(data.takeProfit)}
          </p>
        </div>
        <div className="rounded-md border bg-card/60 px-3 py-2">
          <p className="label-caps">R : R</p>
          <p className="mt-0.5 font-medium">1 : {data.rewardRisk}</p>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <Link href={`/signals/${data.id}`}>
            Full intelligence <ArrowRight />
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => copyOpportunity(data)}>
          <Copy /> Copy signal
        </Button>
        <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <BellRing className="size-3.5" aria-hidden />
          Prime signals push via in-app, Telegram &amp; WhatsApp
        </p>
      </div>
    </Card>
  );
}
