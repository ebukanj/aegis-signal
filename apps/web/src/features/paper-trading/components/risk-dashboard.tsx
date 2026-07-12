import { ChartCard } from "@/components/shared/chart-card";
import { MetricCard } from "@/components/shared/metric-card";
import { AlertTriangle, TrendingDown, ShieldAlert } from "lucide-react";
import type { RiskMetrics } from "../types";

export function RiskDashboard({ risk, className }: { risk: RiskMetrics, className?: string }) {
  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Portfolio Heat"
          value={`${risk.portfolioHeat.toFixed(1)}%`}
          icon={AlertTriangle}
          hint="Total capital at risk"
          deltaDirection={risk.portfolioHeat > 5 ? "down" : "up"}
        />
        <MetricCard
          label="Current Drawdown"
          value={`${risk.currentDrawdown.toFixed(1)}%`}
          icon={TrendingDown}
          hint="From all-time high"
          deltaDirection="down"
        />
        <MetricCard
          label="Max Drawdown"
          value={`${risk.maxDrawdown.toFixed(1)}%`}
          icon={ShieldAlert}
          hint="Historical worst"
        />
      </div>

      <ChartCard title="Risk by Strategy" description="Capital exposure distribution">
        <div className="space-y-4 pt-4">
          {risk.riskByStrategy.map((s) => {
            const pct = (s.value / risk.portfolioHeat) * 100;
            return (
              <div key={s.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span>{s.label}</span>
                  <span className="font-numeric text-muted-foreground">{s.value.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div 
                    className="h-full rounded-full transition-all duration-500 bg-destructive/80" 
                    style={{ width: `${pct}%` }} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}
