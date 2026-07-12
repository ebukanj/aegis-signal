import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  /** Preformatted value — formatting rules belong to the caller. */
  value: string;
  /** Preformatted change indicator, e.g. "+2.4%". */
  delta?: string;
  /** Direction drives semantic color and the trend glyph. */
  deltaDirection?: "up" | "down" | "flat";
  /** Context under the value, e.g. "vs. last 7 days". */
  hint?: string;
  icon?: LucideIcon;
  loading?: boolean;
  /** Compact tiles suit dense summary rows (scanner, toolbars). */
  size?: "default" | "compact";
  className?: string;
}

/**
 * KPI stat tile. Numeric values render in the terminal numeric face;
 * deltas pair color with a directional glyph (never color alone).
 */
export function MetricCard({
  label,
  value,
  delta,
  deltaDirection = "flat",
  hint,
  icon: Icon,
  loading = false,
  size = "default",
  className,
}: MetricCardProps) {
  const compact = size === "compact";

  if (loading) {
    return (
      <Card className={cn("min-w-0 gap-2", compact ? "p-3" : "p-4", className)}>
        <Skeleton className="h-3.5 w-20 max-w-full" />
        <Skeleton className={cn("max-w-full", compact ? "h-5 w-16" : "h-7 w-28")} />
        {!compact && <Skeleton className="h-3.5 w-24 max-w-full" />}
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "min-w-0 gap-1.5 transition-colors hover:border-foreground/15",
        compact ? "p-3" : "gap-2 p-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="label-caps truncate">{label}</span>
        {Icon && (
          <span
            aria-hidden
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground",
              compact ? "size-6" : "size-7",
            )}
          >
            <Icon className={compact ? "size-3.5" : "size-4"} />
          </span>
        )}
      </div>
      <p
        className={cn(
          "font-numeric truncate font-semibold leading-none",
          compact ? "text-lg" : "text-2xl",
        )}
        title={value}
      >
        {value}
      </p>
      {(delta || hint) && (
        <div className="flex min-w-0 items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "font-numeric inline-flex shrink-0 items-center gap-1 font-medium",
                deltaDirection === "up" && "text-success",
                deltaDirection === "down" && "text-destructive",
                deltaDirection === "flat" && "text-muted-foreground",
              )}
            >
              {deltaDirection === "up" && <TrendingUp className="size-3.5" aria-label="up" />}
              {deltaDirection === "down" && <TrendingDown className="size-3.5" aria-label="down" />}
              {delta}
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
      )}
    </Card>
  );
}
