import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  /** Accessible description of what is loading. */
  label?: string;
  className?: string;
}

/** Centered spinner for pending regions and Suspense fallbacks. */
export function Loader({ label = "Loading", className }: LoaderProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "flex items-center justify-center gap-2 p-10 text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
