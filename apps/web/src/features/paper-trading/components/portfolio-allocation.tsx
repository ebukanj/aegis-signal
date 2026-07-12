"use client";

import { ChartCard } from "@/components/shared/chart-card";
import type { PortfolioAllocation as IPortfolioAllocation } from "../types";

export function PortfolioAllocation({ allocation, className }: { allocation: IPortfolioAllocation, className?: string }) {
  // Let's just show Allocation by Coin and By Direction for simplicity in this horizontal bar view
  const renderBars = (data: { label: string; value: number; color: string }[]) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return (
      <div className="space-y-3 pt-2">
        {data.map((d) => {
          const pct = total === 0 ? 0 : (d.value / total) * 100;
          return (
            <div key={d.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{d.label}</span>
                <span className="font-numeric text-muted-foreground">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ width: `${pct}%`, backgroundColor: d.color }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ChartCard
      title="Portfolio Allocation"
      description="Exposure by Asset and Direction"
      className={className}
    >
      <div className="grid gap-6 sm:grid-cols-2 pt-4">
        <div>
          <span className="label-caps mb-2 block">By Asset</span>
          {renderBars(allocation.byCoin)}
        </div>
        <div>
          <span className="label-caps mb-2 block">By Direction</span>
          {renderBars(allocation.byDirection)}
        </div>
      </div>
    </ChartCard>
  );
}
