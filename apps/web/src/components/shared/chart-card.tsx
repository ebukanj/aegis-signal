import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  /** Optional context under the title. */
  description?: string;
  /** Right side of the header: current value, badges, toolbar. */
  headerSlot?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable chart container: consistent header chrome around any chart body.
 * The body owns its own loading/empty/error states.
 */
export function ChartCard({
  title,
  description,
  headerSlot,
  children,
  className,
}: ChartCardProps) {
  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {headerSlot}
      </div>
      {children}
    </Card>
  );
}
