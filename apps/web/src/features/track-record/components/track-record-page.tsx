"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReliabilityChart } from "@/features/track-record/components/reliability-chart";
import { getMockTrackRecord } from "@/features/track-record/data/mock-record";
import type { StrategyRecordRow } from "@/features/track-record/data/mock-record";
import { cn } from "@/lib/utils";

/**
 * Track Record — the scoreboard.
 *
 * The old Analytics Center had an equity curve, a heatmap calendar, a strategy
 * radar, a correlation matrix, a trade-distribution histogram and an AI insight
 * panel. Twenty-two files. It answered everything except the only two questions
 * that decide whether this platform deserves to exist:
 *
 *     1. Have these signals actually made money?
 *     2. When we say 90, are we right 90% of the time?
 *
 * Today the honest answer to both is **we don't know yet** — nothing has
 * settled. So that is what the page says. A track record page that invents a
 * track record is worse than no page at all: it is the same lie as a random 91%,
 * dressed up in charts.
 */
export function TrackRecordPage() {
  const { data, isPending } = useQuery({
    queryKey: ["track-record"],
    queryFn: async () => getMockTrackRecord(),
  });

  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const noOutcomes = data.settledSignals === 0;

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader
        title="Track Record"
        description="Have these signals actually made money?"
      />

      {noOutcomes && (
        <Card className="gap-2 border-dashed p-5">
          <h2 className="text-sm font-semibold">No settled signals yet.</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The platform has not resolved a single trade, because it is not
            connected to a market. Every number below is therefore empty rather
            than estimated — and every confidence score in the app reads{" "}
            <span className="font-medium text-foreground">uncalibrated</span>{" "}
            until this page has something to say.
          </p>
          <p className="max-w-2xl text-xs text-muted-foreground">
            This is the page that earns the right to show you a percentage. Until
            it does, nobody here gets to claim one.
          </p>
        </Card>
      )}

      {/* The four numbers that matter */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Signals sent" value={data.settledSignals} />
        <Stat
          label="Won"
          value={
            data.settledSignals > 0
              ? `${data.wins} (${Math.round((data.wins / data.settledSignals) * 100)}%)`
              : null
          }
        />
        <Stat
          label="Average R"
          value={data.avgR === null ? null : `${data.avgR > 0 ? "+" : ""}${data.avgR}R`}
          tone={data.avgR === null ? undefined : data.avgR >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Expectancy"
          value={
            data.expectancy === null
              ? null
              : `${data.expectancy > 0 ? "+" : ""}${data.expectancy}R`
          }
          tone={
            data.expectancy === null
              ? undefined
              : data.expectancy >= 0
                ? "good"
                : "bad"
          }
          hint="What you make per trade, on average, over the long run."
        />
      </div>

      <ReliabilityChart
        points={data.calibration}
        historical={data.historicalCalibration}
      />

      {/* Per strategy */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-tight">By strategy</h2>
          <p className="text-xs text-muted-foreground">
            A strategy whose expectancy turns negative auto-disables.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.strategies.map((strategy) => (
            <StrategyRow key={strategy.id} strategy={strategy} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number | null;
  tone?: "good" | "bad";
  hint?: string;
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="label-caps text-muted-foreground">{label}</p>
      {value === null ? (
        <p className="text-lg font-medium text-muted-foreground">—</p>
      ) : (
        <p
          className={cn(
            "font-numeric text-lg font-semibold",
            tone === "good" && "text-success",
            tone === "bad" && "text-destructive",
          )}
        >
          {value}
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function StrategyRow({ strategy }: { strategy: StrategyRecordRow }) {
  const proven = strategy.signals > 0;

  return (
    <Card className={cn("gap-2 p-4", !strategy.enabled && "bg-muted/30")}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">
          {strategy.name}
        </span>
        {!strategy.enabled && (
          <span className="rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            off
          </span>
        )}
      </div>

      {proven ? (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="label-caps text-muted-foreground">Signals</dt>
            <dd className="font-numeric mt-0.5 font-medium">
              {strategy.signals}
            </dd>
          </div>
          <div>
            <dt className="label-caps text-muted-foreground">Won</dt>
            <dd className="font-numeric mt-0.5 font-medium">
              {Math.round((strategy.wins / strategy.signals) * 100)}%
            </dd>
          </div>
          <div>
            <dt className="label-caps text-muted-foreground">Expectancy</dt>
            <dd
              className={cn(
                "font-numeric mt-0.5 font-medium",
                (strategy.expectancy ?? 0) >= 0
                  ? "text-success"
                  : "text-destructive",
              )}
            >
              {(strategy.expectancy ?? 0) > 0 ? "+" : ""}
              {strategy.expectancy}R
            </dd>
          </div>
        </dl>
      ) : (
        <div>
          <p className="text-xs font-medium">Unproven</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            No settled signals. It can produce signals, but it cannot enter
            today&apos;s Prime few until it has earned a record.
          </p>
        </div>
      )}
    </Card>
  );
}
