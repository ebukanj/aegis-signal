"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles, TriangleAlert } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { REGIME_META, RISK_META } from "@/constants/domain";
import { formatPrice, formatSignalTime } from "@/lib/format";
import { buildTradeInstruction } from "@/lib/trade-instruction";
import { buildCalibration } from "@/features/signals/data/mock-confidence";
import { useSignalDetail } from "@/features/signals/hooks/use-signal-detail";
import { ConfidenceBreakdownPanel } from "@/features/signals/components/confidence-breakdown-panel";
import { CopySignalButton } from "@/features/signals/components/copy-signal-button";
import { LivePrice } from "@/features/signals/components/live-price";
import { PositionCalculator } from "@/features/signals/components/position-calculator";
import { StrategyExplanation } from "@/features/signals/components/strategy-explanation";
import type { Opportunity } from "@/features/scanner/types";

/**
 * The signal, opened in place.
 *
 * Clicking a signal must not navigate away from the list — a trader is
 * comparing today's handful of trades, and losing the list to read one of them
 * is the wrong trade-off. The full report still exists at /signals/[id].
 */
export function SignalPanel({
  signal,
  onClose,
}: {
  signal: Opportunity | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={signal !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        {signal && <PanelBody signal={signal} />}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({ signal }: { signal: Opportunity }) {
  const { data, isPending, isError } = useSignalDetail(signal.id);
  const risk = RISK_META[signal.riskLevel];
  const market = REGIME_META[signal.regime];
  const detail = data?.detail;

  // Shaped exactly as the Confidence Engine will emit it (ADR-024). The
  // frontend renders this; it must never compute a score.
  const calibration = buildCalibration(signal);

  return (
    <>
      {/* pr-12 keeps the badges clear of the sheet's close button */}
      <SheetHeader className="gap-3 border-b pr-12">
        <div className="flex flex-wrap items-center gap-2">
          {signal.isPrime && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="size-3" aria-hidden />
              Prime
            </span>
          )}
          <SheetTitle className="text-lg">{signal.pair}</SheetTitle>
          <DirectionBadge direction={signal.direction} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge
            score={calibration.score}
            displayedWinRate={calibration.displayedWinRate}
            basis={calibration.basis}
          />
          <StatusBadge status={risk.status}>{risk.label} risk</StatusBadge>
          <StatusBadge status={market.status}>{market.label}</StatusBadge>
        </div>

        {/* Is the trade still there? */}
        <LivePrice signal={signal} showHint />

        <SheetDescription className="text-sm leading-relaxed text-foreground">
          {buildTradeInstruction(signal)}
        </SheetDescription>

        <div className="flex items-center justify-between gap-3">
          <p className="font-numeric text-xs text-muted-foreground">
            Published {formatSignalTime(signal.generatedAt)}
          </p>
          <CopySignalButton signal={signal} />
        </div>
      </SheetHeader>

      <div className="space-y-4 p-4">
        {/* What proves it wrong — first, not last. */}
        <Card className="gap-2 border-destructive/30 bg-destructive/[0.03] p-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-destructive" aria-hidden />
            <h3 className="text-sm font-semibold tracking-tight">
              What proves this wrong
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            A close beyond{" "}
            <span className="font-numeric font-medium text-destructive">
              {formatPrice(signal.stopLoss)}
            </span>{" "}
            invalidates the setup. Exit — do not average down. The stop is the
            trade&apos;s thesis, not a suggestion.
          </p>
        </Card>

        <PositionCalculator signal={signal} />

        {/* The score, with its arithmetic shown — never a bare number. */}
        <ConfidenceBreakdownPanel calibration={calibration} />

        {/* Why it exists */}
        {isPending && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-muted-foreground">
            Could not load the full reasoning for this signal.
          </p>
        )}

        {detail && <StrategyExplanation signal={detail} />}

        <Button asChild variant="outline" className="w-full">
          <Link href={`/signals/${signal.id}`}>
            Open the full report
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </>
  );
}
