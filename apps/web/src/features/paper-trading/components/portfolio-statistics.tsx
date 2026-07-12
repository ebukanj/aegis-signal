import { Card } from "@/components/ui/card";
import { formatPrice, formatPercent } from "@/lib/format";
import type { PortfolioStats } from "../types";

export function PortfolioStatistics({ stats, className }: { stats: PortfolioStats, className?: string }) {
  const data = [
    { label: "Total Trades", value: stats.totalTrades },
    { label: "Average Return", value: formatPercent(stats.averageReturnPct) },
    { label: "Avg Holding Time", value: `${stats.averageHoldingTimeHours.toFixed(1)}h` },
    { label: "Average Winner", value: formatPercent(stats.averageWinnerPct), className: "text-success font-medium" },
    { label: "Average Loser", value: formatPercent(stats.averageLoserPct), className: "text-destructive font-medium" },
    { label: "Largest Win", value: formatPrice(stats.largestWinDollar), className: "text-success font-medium" },
    { label: "Largest Loss", value: formatPrice(stats.largestLossDollar), className: "text-destructive font-medium" },
    { label: "Best Day", value: formatPrice(stats.bestDayDollar), className: "text-success font-medium" },
    { label: "Worst Day", value: formatPrice(stats.worstDayDollar), className: "text-destructive font-medium" },
    { label: "Profit Factor", value: stats.profitFactor.toFixed(2) },
    { label: "Expectancy (R)", value: `${stats.expectancy.toFixed(2)}R` },
    { label: "Recovery Factor", value: stats.recoveryFactor.toFixed(2) },
  ];

  return (
    <Card className={`p-6 ${className}`}>
      <h3 className="font-semibold text-lg mb-6">Advanced Statistics</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {data.map((item) => (
          <div key={item.label} className="space-y-1">
            <span className="text-sm text-muted-foreground block">{item.label}</span>
            <span className={`font-numeric text-lg ${item.className || ""}`}>{item.value}</span>
          </div>
        ))}
        
        {/* Consistency Score gauge */}
        <div className="col-span-2 md:col-span-3 lg:col-span-4 mt-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-sm">Consistency Score</span>
            <span className="font-numeric font-bold text-primary">{stats.consistencyScore}/100</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className="h-full rounded-full transition-all duration-500 bg-primary" 
              style={{ width: `${stats.consistencyScore}%` }} 
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Based on R-multiple variance, drawdown recovery time, and adherence to risk parameters.
          </p>
        </div>
      </div>
    </Card>
  );
}
