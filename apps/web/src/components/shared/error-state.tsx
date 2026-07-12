"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Retry handler; the button renders only when provided. */
  onRetry?: () => void;
  className?: string;
}

/** Standard inline error state for failed data loads. */
export function ErrorState({
  title = "Something went wrong",
  description = "The data could not be loaded. Try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-10 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-md border border-destructive/25 bg-card text-destructive">
        <AlertTriangle className="size-4.5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> Retry
        </Button>
      )}
    </div>
  );
}
