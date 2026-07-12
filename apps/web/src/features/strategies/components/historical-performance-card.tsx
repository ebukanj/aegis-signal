import { Card } from "@/components/ui/card";
import type { StrategyProfile } from "@/features/strategies/types";
import { cn } from "@/lib/utils";

/** Answers: "What has this strategy actually done?" — losses included. */
export function HistoricalPerformanceCard({
  strategy,
  className,
}: {
  strategy: StrategyProfile;
  className?: string;
}) {
  const h = strategy.historical;
  const rows: { label: string; value: string; tone?: "long" | "short" }[] = [
    { label: "Total Signals", value: String(h.totalSignals) },
    { label: "Winning Trades", value: String(h.wins), tone: "long" },
    { label: "Losing Trades", value: String(h.losses), tone: "short" },
    { label: "Avg Holding Time", value: `${h.avgHoldingHours}h` },
    {
      label: "Best Month",
      value: `${h.bestMonth.month} · +${h.bestMonth.returnR}R`,
      tone: "long",
    },
    {
      label: "Worst Month",
      value: `${h.worstMonth.month} · ${h.worstMonth.returnR}R`,
      tone: "short",
    },
    { label: "Largest Win", value: `+${h.largestWinR}R`, tone: "long" },
    { label: "Largest Loss", value: `${h.largestLossR}R`, tone: "short" },
    { label: "Longest Win Streak", value: String(h.longestWinStreak) },
    { label: "Longest Loss Streak", value: String(h.longestLossStreak) },
  ];

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <h3 className="text-sm font-semibold tracking-tight">
        Historical Performance
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border p-3">
            <dt className="label-caps">{row.label}</dt>
            <dd
              className={cn(
                "font-numeric mt-1 text-sm font-semibold",
                row.tone === "long" && "text-long",
                row.tone === "short" && "text-short",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
