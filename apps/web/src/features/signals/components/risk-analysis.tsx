import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { RISK_META } from "@/constants/domain";
import type { SignalDetail } from "@/features/signals/types";
import { cn } from "@/lib/utils";

/**
 * Answers: "How risky is this, exactly?"
 * Every risk factor is measured and named; unmeasurable factors are shown
 * as explicitly unavailable rather than hidden (fail-safe transparency).
 */
export function RiskAnalysis({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  const overall = RISK_META[signal.riskLevel];

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">Risk Analysis</h2>
        </div>
        <StatusBadge status={overall.status}>{overall.label} risk</StatusBadge>
      </div>

      {/* Portfolio heat */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Exposure Heat</span>
          <span className="font-numeric text-sm">{signal.heatScore}/100</span>
        </div>
        <Progress
          value={signal.heatScore}
          className="h-1.5"
          aria-label={`Exposure heat ${signal.heatScore} out of 100`}
        />
        <p className="text-xs text-muted-foreground">
          How much of the platform&apos;s risk budget this trade would consume
          alongside currently active signals.
        </p>
      </div>

      <Separator />

      <ul className="grid gap-3 sm:grid-cols-2">
        {signal.riskFactors.map((factor) => {
          const meta = RISK_META[factor.rating];
          return (
            <li key={factor.name} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{factor.name}</span>
                {factor.available ? (
                  <StatusBadge status={meta.status}>{meta.label}</StatusBadge>
                ) : (
                  <StatusBadge status="neutral" dot={false}>
                    Not yet measured
                  </StatusBadge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{factor.note}</p>
            </li>
          );
        })}
      </ul>

      {signal.warnings.length > 0 && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden /> Risk warnings
          </p>
          <ul className="space-y-1 pl-1">
            {signal.warnings.map((warning) => (
              <li key={warning} className="text-sm text-muted-foreground">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
