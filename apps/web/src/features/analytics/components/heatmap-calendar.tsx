"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { HeatmapMonth, HeatmapDay } from "../types";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Map a return value to a color class. */
function cellColor(value: number | null): string {
  if (value === null) return "bg-muted/30";
  if (value >= 2) return "bg-success/70";
  if (value >= 0.5) return "bg-success/40";
  if (value >= -0.5) return "bg-muted-foreground/15";
  if (value >= -2) return "bg-destructive/40";
  return "bg-destructive/70";
}

function cellTooltip(day: HeatmapDay): string {
  if (day.value === null) return `${day.date}: No trades`;
  return `${day.date}: ${day.value >= 0 ? "+" : ""}${day.value.toFixed(2)}% (${day.trades} trade${day.trades !== 1 ? "s" : ""})`;
}

interface HeatmapCalendarProps {
  heatmap: HeatmapMonth[];
  loading?: boolean;
  className?: string;
}

/**
 * Calendar-style monthly performance heatmap. Each cell is one day,
 * colored by daily return. Includes monthly and weekly return summaries.
 */
export function HeatmapCalendar({
  heatmap,
  loading = false,
  className,
}: HeatmapCalendarProps) {
  if (loading) {
    return (
      <ChartCard title="Monthly Performance Heatmap" className={className}>
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Monthly Performance Heatmap"
      description="Daily return intensity by month"
      headerSlot={<HeatmapLegend />}
      className={className}
    >
      <TooltipProvider delayDuration={100}>
        <div className="space-y-4">
          {heatmap.map((month) => (
            <MonthGrid key={month.key} month={month} />
          ))}
        </div>
      </TooltipProvider>
    </ChartCard>
  );
}

function MonthGrid({ month }: { month: HeatmapMonth }) {
  // Determine the day of week for the first day (0=Mon, 6=Sun)
  const firstDate = new Date(month.days[0]?.date ?? `${month.key}-01`);
  const firstDow = (firstDate.getUTCDay() + 6) % 7; // Monday = 0

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium">{month.label}</span>
        <span
          className={cn(
            "font-numeric text-xs font-medium",
            month.monthReturn >= 0 ? "text-success" : "text-destructive",
          )}
        >
          {month.monthReturn >= 0 ? "+" : ""}{month.monthReturn.toFixed(2)}%
        </span>
      </div>
      <div className="grid grid-cols-7 gap-[3px]" role="grid" aria-label={`${month.label} heatmap`}>
        {/* Day labels */}
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[8px] text-muted-foreground">
            {d}
          </div>
        ))}
        {/* Empty cells before the first day */}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* Day cells */}
        {month.days.map((day) => (
          <Tooltip key={day.date}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "aspect-square rounded-[3px] transition-transform hover:scale-110",
                  cellColor(day.value),
                )}
                role="gridcell"
                aria-label={cellTooltip(day)}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="font-numeric text-xs">
              {cellTooltip(day)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function HeatmapLegend() {
  const items = [
    { label: "Strong +", cls: "bg-success/70" },
    { label: "Moderate +", cls: "bg-success/40" },
    { label: "Neutral", cls: "bg-muted-foreground/15" },
    { label: "Moderate −", cls: "bg-destructive/40" },
    { label: "Strong −", cls: "bg-destructive/70" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <div className={cn("size-2.5 rounded-[2px]", item.cls)} />
          <span className="text-[9px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
