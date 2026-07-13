"use client";

import type { CalibratedConfidence, ContributorSource } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The score, with its arithmetic shown.
 *
 * The platform used to print "91%" from a random number. It now shows the sum —
 * every line, its weight, and the measured value it came from — because a number
 * without its working is an assertion, and this platform does not make
 * assertions (Founding Principle 3).
 *
 * Note the honesty at the bottom: until there are settled outcomes, the score is
 * NOT a win rate and we say so plainly. That label is the difference between
 * intelligence and decoration.
 */

const SOURCE_LABEL: Record<ContributorSource, string> = {
  MEASURED: "measured",
  LEDGER: "from our results",
  HISTORICAL: "from history",
  RULE: "rule",
};

export function ConfidenceBreakdownPanel({
  calibration,
}: {
  calibration: CalibratedConfidence;
}) {
  const { score, contributors, basis, displayedWinRate } = calibration;

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight">
          Why {score}
        </h3>
        {displayedWinRate === null ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Uncalibrated
          </span>
        ) : (
          <span className="font-numeric text-sm font-semibold text-success">
            {displayedWinRate}% win rate
          </span>
        )}
      </div>

      <dl className="space-y-1.5">
        {contributors.map((c) => (
          <div key={c.name} className="flex items-baseline gap-3 text-sm">
            <dt className="min-w-0 flex-1">
              <span className="block truncate">{c.name}</span>
              <span className="block text-xs text-muted-foreground">
                {c.measured}
                <span className="ml-1.5 opacity-60">
                  ({SOURCE_LABEL[c.source]})
                </span>
              </span>
            </dt>
            <dd
              className={cn(
                "font-numeric shrink-0 font-medium tabular-nums",
                c.weight < 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {c.weight > 0 ? "+" : ""}
              {c.weight}
            </dd>
          </div>
        ))}

        <div className="flex items-baseline justify-between border-t pt-2 text-sm font-semibold">
          <dt>Score</dt>
          <dd className="font-numeric tabular-nums">{score}</dd>
        </div>
      </dl>

      {basis === "UNCALIBRATED" && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            This is a score, not a win rate.
          </span>{" "}
          It is the sum of the rules this setup satisfied. We have no settled
          signals yet, so we cannot tell you how often a score like this actually
          wins — and we will not invent a number to fill the gap.
        </p>
      )}
    </Card>
  );
}
