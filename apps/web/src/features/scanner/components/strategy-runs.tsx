"use client";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type {
  StrategyRun,
  StrategyScanState,
} from "@/features/scanner/data/mock-scan";

/**
 * What each strategy is doing right now.
 *
 * The critical column is the one people forget: **why a strategy is switched
 * off**. A suppressed strategy is the regime filter working — it is not a
 * fault, and the user must be able to tell the difference between "Reversal
 * found nothing" and "Reversal is deliberately not looking, because the market
 * is trending and fading a trend is how accounts die."
 */

const STATE_META: Record<
  StrategyScanState,
  { label: string; status: "success" | "warning" | "neutral" }
> = {
  SCANNING: { label: "Scanning", status: "success" },
  SUPPRESSED: { label: "Suppressed", status: "warning" },
  DISABLED: { label: "Disabled", status: "neutral" },
};

export function StrategyRuns({ runs }: { runs: StrategyRun[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          Strategies scanning
        </h2>
        <p className="text-xs text-muted-foreground">
          A suppressed strategy is the regime filter working, not a fault.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {runs.map((run) => {
          const meta = STATE_META[run.state];
          const idle = run.state !== "SCANNING";

          return (
            <Card
              key={run.strategy}
              className={cn("gap-3 p-4", idle && "bg-muted/30")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold tracking-tight">
                  {run.strategy}
                </span>
                <StatusBadge status={meta.status}>{meta.label}</StatusBadge>
              </div>

              {run.stateReason ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {run.stateReason}
                </p>
              ) : (
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <Metric label="Checked" value={run.pairsChecked} />
                  <Metric label="Candidates" value={run.candidates} />
                  <Metric
                    label="Passed"
                    value={run.promoted}
                    tone="success"
                  />
                </dl>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success";
}) {
  return (
    <div>
      <dt className="label-caps text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-numeric font-medium",
          tone === "success" && value > 0 && "text-success",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
