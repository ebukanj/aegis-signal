import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { SignalDetail } from "@/features/signals/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OverviewRow {
  label: string;
  value: string;
  tone?: "long" | "short" | "muted";
  hint?: string;
}

/** Answers: "What exactly is the trade?" — every parameter in one card. */
export function SignalOverview({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  const rows: OverviewRow[] = [
    { label: "Entry Price", value: formatPrice(signal.entryPrice) },
    { label: "Stop Loss", value: formatPrice(signal.stopLoss), tone: "short" },
    ...signal.takeProfits.map((tp, index) => ({
      label: `Take Profit ${index + 1}`,
      value: formatPrice(tp),
      tone: "long" as const,
    })),
    {
      label: "Position Size",
      value: "—",
      tone: "muted",
      hint: "Arrives with portfolio settings",
    },
    {
      label: "Maximum Risk",
      value: `${signal.maxRiskPercent}%`,
      hint: "Entry to stop distance",
    },
    {
      label: "Expected Reward",
      value: `${signal.expectedR} R`,
      tone: "long",
      hint: "At second target",
    },
  ];

  return (
    <Card className={cn("gap-3 p-4 md:p-5", className)}>
      <h2 className="text-sm font-semibold tracking-tight">Signal Overview</h2>
      <dl className="space-y-1">
        {rows.map((row, index) => (
          <div key={row.label}>
            {index > 0 && <Separator className="my-2" />}
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-right">
                <span
                  className={cn(
                    "font-numeric text-sm font-medium",
                    row.tone === "long" && "text-long",
                    row.tone === "short" && "text-short",
                    row.tone === "muted" && "text-muted-foreground",
                  )}
                >
                  {row.value}
                </span>
                {row.hint && (
                  <p className="text-xs text-muted-foreground">{row.hint}</p>
                )}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
}
