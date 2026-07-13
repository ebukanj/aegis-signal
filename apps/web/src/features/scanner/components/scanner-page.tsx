"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { scannerApi } from "@/features/scanner/api/scanner-api";
import { RejectionLog } from "@/features/scanner/components/rejection-log";
import { ScanStatus } from "@/features/scanner/components/scan-status";
import { StrategyRuns } from "@/features/scanner/components/strategy-runs";

/**
 * Market Scanner — the evidence, not the shop window.
 *
 * The old page was eight metric cards and a ranked table of opportunities. But
 * the ranked opportunities already live on the Signals page, which is where a
 * trader acts. Repeating them here made the Scanner a second, noisier Signals.
 *
 * Its real job is to answer the question a quiet day provokes:
 *
 *     "Is this thing even working?"
 *
 * So it shows what the scan looked at, which strategies are live (and which are
 * deliberately switched off, and why), and — most importantly — every setup it
 * threw away and the exact number it failed on. Silence without evidence is
 * indistinguishable from a broken feed.
 */
export function ScannerPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["scanner", "run"],
    queryFn: () => scannerApi.getScanRun(),
  });

  if (isError) {
    return (
      <ErrorState
        title="Scanner unavailable"
        description="The scan result could not be loaded."
        onRetry={() => refetch()}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader
        title="Market Scanner"
        description="What the scan found — and what it rejected."
      />

      {isPending || !data ? (
        <LoadingState />
      ) : (
        <>
          <ScanStatus scan={data} />
          <StrategyRuns runs={data.strategyRuns} />
          <RejectionLog rejections={data.rejections} />
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
