"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Copy, SearchX, Share2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBreakdownPanel } from "@/features/signals/components/confidence-breakdown-panel";
import { HistoricalPerformance } from "@/features/signals/components/historical-performance";
import { RiskAnalysis } from "@/features/signals/components/risk-analysis";
import { SignalChart } from "@/features/signals/components/signal-chart";
import { SignalHeader } from "@/features/signals/components/signal-header";
import { SignalHero } from "@/features/signals/components/signal-hero";
import { SignalOverview } from "@/features/signals/components/signal-overview";
import { SimilarSignalsTable } from "@/features/signals/components/similar-signals-table";
import { StrategyExplanation } from "@/features/signals/components/strategy-explanation";
import { TradePlan } from "@/features/signals/components/trade-plan";
import {
  SignalNotFoundError,
  useSignalDetail,
} from "@/features/signals/hooks/use-signal-detail";
import { copySignal } from "@/features/signals/utils";

// AI commentary loads last by design — it must never block the report
const AICommentary = dynamic(
  () =>
    import("@/features/signals/components/ai-commentary").then(
      (mod) => mod.AICommentary,
    ),
  { loading: () => <Skeleton className="h-48 w-full rounded-lg" /> },
);

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading signal intelligence">
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-[480px] lg:col-span-8" />
        <Skeleton className="h-[480px] lg:col-span-4" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Signal Intelligence report. Answers:
 * "Why should I trust this trading opportunity?"
 */
export function SignalIntelligencePage({ signalId }: { signalId: string }) {
  const { data, isPending, isError, error, refetch } = useSignalDetail(signalId);

  if (isPending) return <PageSkeleton />;

  if (isError) {
    if (error instanceof SignalNotFoundError) {
      return (
        <EmptyState
          icon={SearchX}
          title="Signal not found"
          description="This signal does not exist or has been rotated out of the current scan window."
          action={
            <Button asChild variant="outline">
              <Link href="/scanner">Back to scanner</Link>
            </Button>
          }
          className="min-h-[50vh]"
        />
      );
    }
    return (
      <ErrorState
        title="Signal intelligence unavailable"
        description="The signal report could not be loaded."
        onRetry={() => refetch()}
        className="min-h-[50vh]"
      />
    );
  }

  const { detail, prevId, nextId } = data;

  return (
    <div className="space-y-4 pb-16 md:pb-0">
      <SignalHeader signal={detail} prevId={prevId} nextId={nextId} />
      <SignalHero signal={detail} />

      {/* Chart + trade parameters, side by side on desktop */}
      <div className="grid gap-4 lg:grid-cols-12">
        <SignalChart signal={detail} className="lg:col-span-8" />
        <SignalOverview signal={detail} className="lg:col-span-4" />
      </div>

      {/* Transparency: confidence and risk */}
      <div className="grid gap-4 lg:grid-cols-12">
        {detail.calibration && (
          <div className="lg:col-span-6">
            <ConfidenceBreakdownPanel calibration={detail.calibration} />
          </div>
        )}
        <RiskAnalysis signal={detail} className="lg:col-span-6" />
      </div>

      {/* Explainability and execution */}
      <div className="grid gap-4 lg:grid-cols-12">
        <StrategyExplanation signal={detail} className="lg:col-span-7" />
        <TradePlan signal={detail} className="lg:col-span-5" />
      </div>

      {/* Historical context */}
      <HistoricalPerformance signal={detail} />
      <SimilarSignalsTable signals={detail.similarSignals} />

      {/* AI context — lazy, never blocking */}
      <AICommentary signalId={detail.id} />

      {/* Mobile sticky action bar */}
      <Card className="fixed inset-x-3 bottom-3 z-40 flex-row items-center gap-2 border bg-card/95 p-2 backdrop-blur-sm md:hidden">
        <Button size="sm" className="flex-1" onClick={() => copySignal(detail)}>
          <Copy /> Copy signal
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() =>
            toast.info("Sharing arrives with notification channels.")
          }
        >
          <Share2 /> Share
        </Button>
      </Card>
    </div>
  );
}
