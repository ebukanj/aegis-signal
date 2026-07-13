"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { signalsApi } from "@/features/signals/api/signals-api";
import { MarketContextStrip } from "@/features/signals/components/market-context-strip";
import { NoSignals } from "@/features/signals/components/no-signals";
import { SignalCard } from "@/features/signals/components/signal-card";
import { SignalPanel } from "@/features/signals/components/signal-panel";
import type { Opportunity } from "@/features/scanner/types";

/**
 * The home page, and the product.
 *
 * It answers exactly one question — *what should I trade today?* — and it
 * answers it with a handful of signals, not a wall of data. Everything else in
 * Aegis Signal exists to make these few cards trustworthy (AGENTS.md §1).
 */
export function SignalsWorkspace() {
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["signals", "today"],
    queryFn: () => signalsApi.getTodaysSignals(),
  });

  if (isPending) return <LoadingState />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load today's signals"
        description="The scan result could not be fetched."
        onRetry={() => refetch()}
      />
    );
  }

  const { context, prime, validated } = data;

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader
        title="Signals"
        description="What should I trade today?"
      />

      <MarketContextStrip context={context} primeCount={prime.length} />

      {prime.length === 0 ? (
        <NoSignals context={context} />
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              Today&apos;s trades
            </h2>
            <p className="text-xs text-muted-foreground">
              Only these are pushed to your alerts.
            </p>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {prime.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                onSelect={setSelected}
              />
            ))}
          </div>
        </section>
      )}

      {validated.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              Also validated
            </h2>
            <p className="text-xs text-muted-foreground">
              Passed every risk check, but did not clear the bar for today&apos;s
              few. Shown for transparency — never pushed.
            </p>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {validated.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                onSelect={setSelected}
              />
            ))}
          </div>
        </section>
      )}

      <SignalPanel signal={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-14 w-64" />
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}
