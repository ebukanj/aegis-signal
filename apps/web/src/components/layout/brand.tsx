import { AegisMark } from "@/components/layout/aegis-mark";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

interface BrandProps {
  className?: string;
  /** Hide the wordmark and render the mark only (collapsed sidebar). */
  markOnly?: boolean;
  /** Larger treatment for the landing and auth pages. */
  size?: "sm" | "lg";
}

/** Platform logo: the Aegis mark + wordmark. */
export function Brand({ className, markOnly = false, size = "sm" }: BrandProps) {
  const large = size === "lg";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20",
          large ? "size-12" : "size-9",
        )}
      >
        <AegisMark className={large ? "size-7" : "size-5"} />
      </div>

      {!markOnly && (
        <div className="grid leading-none">
          <span
            className={cn(
              "font-semibold tracking-tight",
              large ? "text-lg" : "text-sm",
            )}
          >
            {siteConfig.name}
          </span>
          {/* Inherits current color so it reads on light pages AND the
              always-dark sidebar */}
          <span
            className={cn(
              "font-medium uppercase tracking-[0.14em] opacity-60",
              large ? "mt-1 text-[11px]" : "text-[10px]",
            )}
          >
            Market Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
