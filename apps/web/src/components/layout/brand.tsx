import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

interface BrandProps {
  className?: string;
  /** Hide the wordmark and render the mark only (collapsed sidebar). */
  markOnly?: boolean;
}

/** Platform logo: emerald shield mark + wordmark. */
export function Brand({ className, markOnly = false }: BrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Shield className="size-4.5" strokeWidth={2.25} />
      </div>
      {!markOnly && (
        <div className="grid leading-none">
          <span className="text-sm font-semibold tracking-tight">
            {siteConfig.name}
          </span>
          {/* Inherits current color so it reads on light pages AND the
              always-dark sidebar */}
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-60">
            Market Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
