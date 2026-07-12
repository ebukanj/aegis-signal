import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      status: {
        neutral: "border-border bg-muted/50 text-muted-foreground",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        error: "border-destructive/25 bg-destructive/10 text-destructive",
        info: "border-info/25 bg-info/10 text-info",
        long: "border-long/25 bg-long/10 text-long",
        short: "border-short/25 bg-short/10 text-short",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  },
);

interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /** Show the leading status dot. */
  dot?: boolean;
}

/**
 * Semantic status indicator. Meaning is always conveyed by the label text,
 * never by color alone (DESIGN_SYSTEM.md §8).
 */
export function StatusBadge({
  status,
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ status }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
