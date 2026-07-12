import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RadialProgress } from "@/components/shared/radial-progress";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StrategyProfile } from "@/features/strategies/types";
import { cn } from "@/lib/utils";

const RECOVERY_META = {
  RECOVERED: { label: "Recovered", status: "success" as const },
  RECOVERING: { label: "Recovering", status: "warning" as const },
  IN_DRAWDOWN: { label: "In drawdown", status: "error" as const },
};

/** Answers: "Can this strategy be trusted right now?" */
export function HealthDashboard({
  strategy,
  className,
}: {
  strategy: StrategyProfile;
  className?: string;
}) {
  const { health } = strategy;
  const recovery = RECOVERY_META[health.recoveryStatus];
  const TrendIcon =
    health.trend === "IMPROVING"
      ? TrendingUp
      : health.trend === "DECLINING"
        ? TrendingDown
        : Minus;

  const rings = [
    { label: "Health", value: health.score },
    { label: "Reliability", value: health.reliability },
    { label: "Consistency", value: health.consistency },
    {
      label: "Drawdown Risk",
      value: health.drawdownRisk,
      inverted: true, // high = bad
    },
  ];

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Health</h3>
        <div className="flex items-center gap-2">
          <StatusBadge status={recovery.status}>{recovery.label}</StatusBadge>
          <StatusBadge
            status={
              health.trend === "IMPROVING"
                ? "success"
                : health.trend === "DECLINING"
                  ? "error"
                  : "neutral"
            }
            dot={false}
          >
            <TrendIcon className="size-3" aria-hidden />
            {health.trend.toLowerCase()}
          </StatusBadge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rings.map((ring) => (
          <div
            key={ring.label}
            className="flex flex-col items-center gap-1.5 rounded-lg border p-3"
          >
            <RadialProgress
              value={ring.value}
              tone={
                ring.inverted
                  ? ring.value >= 55
                    ? "error"
                    : ring.value >= 30
                      ? "warning"
                      : "success"
                  : "auto"
              }
              size={64}
              label={`${ring.label}: ${ring.value} out of 100`}
            />
            <span className="label-caps text-center">{ring.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Health is computed from rolling live expectancy, calibration accuracy,
        and drawdown behavior. A strategy whose rolling 50-trade expectancy
        turns negative is automatically disabled (strategies.md).
      </p>
    </Card>
  );
}
