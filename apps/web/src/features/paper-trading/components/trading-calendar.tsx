import { ChartCard } from "@/components/shared/chart-card";
import { formatPrice } from "@/lib/format";
import type { TradingCalendarDay } from "../types";

export function TradingCalendar({ days, className }: { days: TradingCalendarDay[], className?: string }) {
  // Simple DOM heatmap for calendar
  // Assumes days are sorted or we just render them sequentially
  
  return (
    <ChartCard title="Trading Calendar" description="Daily PnL Heatmap (Last 90 Days)" className={className}>
      <div className="pt-4 flex flex-wrap gap-1.5">
        {days.map((day) => {
          let color = "bg-muted";
          if (day.pnl > 0) color = "bg-success/80";
          else if (day.pnl < 0) color = "bg-destructive/80";
          
          return (
            <div 
              key={day.date}
              className={`w-4 h-4 rounded-sm ${color} relative group cursor-pointer`}
            >
              <div className="absolute bottom-full mb-2 hidden group-hover:block w-max p-2 bg-popover text-popover-foreground text-xs rounded shadow-md z-10 -translate-x-1/2 left-1/2">
                <p className="font-semibold">{day.date}</p>
                {day.trades > 0 ? (
                  <>
                    <p>{day.trades} trades</p>
                    <p className={day.pnl >= 0 ? "text-success" : "text-destructive"}>
                      {day.pnl > 0 ? "+" : ""}{formatPrice(day.pnl)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No trades</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Loss</span>
        <div className="w-3 h-3 bg-destructive/80 rounded-sm"></div>
        <div className="w-3 h-3 bg-muted rounded-sm"></div>
        <div className="w-3 h-3 bg-success/80 rounded-sm"></div>
        <span>Win</span>
      </div>
    </ChartCard>
  );
}
