"use client";

import { useState } from "react";
import Link from "next/link";
import { PowerOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { useTodaysSignals } from "@/features/signals/hooks/use-todays-signals";
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

  // Reads the strategy store: a strategy you switched off cannot produce a
  // signal, cannot be a confluence partner, and cannot reach Prime (ADR-024).
  // Also applies the Risk Flag veto — a hacked coin is untouchable.
  const { data, isPending, isError, refetch, blockedCoins } = useTodaysSignals();

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

      {/* A coin does not silently vanish. If the Risk Engine vetoed it, say so. */}
      {blockedCoins.size > 0 && (
        <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.04] px-4 py-3">
          <ShieldAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-destructive">
              {[...blockedCoins].join(", ")}{" "}
              {blockedCoins.size === 1 ? "is" : "are"} blocked.
            </span>{" "}
            No strategy may trade{" "}
            {blockedCoins.size === 1 ? "it" : "them"} right now, however good the
            setup looks.{" "}
            <Link
              href="/insights"
              className="font-medium text-foreground underline underline-offset-2"
            >
              See why
            </Link>
          </p>
        </div>
      )}

      {context.strategiesActive === 0 ? (
        <NoStrategiesEnabled />
      ) : prime.length === 0 ? (
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

/**
 * Silence with a cause. If every strategy is off, the platform is not broken —
 * it is doing exactly what you told it to, and it should say so rather than
 * show an empty page that looks like a failure.
 */
function NoStrategiesEnabled() {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <PowerOff className="size-6 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold tracking-tight">
        Every strategy is switched off.
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Nothing is hunting for you, so there is nothing to show. Switch a
        strategy back on and the next scan will find trades again.
      </p>
      <Button asChild variant="outline">
        <Link href="/strategies">Go to Strategies</Link>
      </Button>
    </Card>
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
