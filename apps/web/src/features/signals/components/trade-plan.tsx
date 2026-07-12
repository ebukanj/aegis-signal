import { CheckCircle2, ClipboardList, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { SignalDetail } from "@/features/signals/types";
import { formatPrice } from "@/lib/format";
import { buildTradeInstruction } from "@/lib/trade-instruction";
import { cn } from "@/lib/utils";

/**
 * Answers: "How should I execute this?"
 * A professional execution plan plus the pre-trade checklist the platform
 * itself ran before publishing the signal.
 */
export function TradePlan({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  const planRows = [
    { label: "Entry", value: formatPrice(signal.entryPrice) },
    { label: "Stop Loss", value: formatPrice(signal.stopLoss) },
    ...signal.takeProfits.map((tp, index) => ({
      label: `Take Profit ${index + 1}`,
      value: formatPrice(tp),
    })),
    {
      label: "Estimated Holding Time",
      value: `~${signal.estimatedHoldingHours}h`,
    },
    { label: "Expected R Multiple", value: `${signal.expectedR} R` },
    {
      label: "Suggested Risk",
      value:
        signal.suggestedRiskPercent !== null
          ? `${signal.suggestedRiskPercent}%`
          : "— arrives with portfolio settings",
    },
  ];

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center gap-2">
        <ClipboardList className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">Trade Plan</h2>
      </div>

      {/* Execution instruction — fields decided by the Risk Engine */}
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
        <p className="label-caps text-primary">How to execute</p>
        <p className="mt-1 text-sm font-medium leading-relaxed">
          {buildTradeInstruction(signal)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Suggested leverage is risk-capped and informational — always size to
          your own risk tolerance.
        </p>
      </div>

      <dl className="space-y-2">
        {planRows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-numeric text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <Separator />

      <div className="space-y-2">
        <p className="label-caps">Pre-trade checklist</p>
        <ul className="space-y-1.5">
          {signal.checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              {item.passed ? (
                <CheckCircle2
                  className="size-4 shrink-0 text-success"
                  aria-label="Passed"
                />
              ) : (
                <XCircle
                  className="size-4 shrink-0 text-destructive"
                  aria-label="Failed"
                />
              )}
              <span className={item.passed ? undefined : "text-destructive"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
