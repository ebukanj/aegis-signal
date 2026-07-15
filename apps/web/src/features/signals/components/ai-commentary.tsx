"use client";

import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Answers: "What does AI make of the current context?"
 * AI explains and contextualizes — it never generated the signal and never
 * overrides deterministic logic (Founding Principle 9).
 *
 * The AI layer is a distinct, later service (SOLUTION_ARCHITECTURE §10) and does
 * not exist yet. Rather than fabricate market prose — the exact thing this platform
 * refuses — this renders an honest "not live yet" notice. The signal is complete
 * without it; AI never gated deterministic output.
 */
export function AICommentary({
  className,
}: {
  signalId?: string;
  className?: string;
}) {
  return (
    <Card className={cn("gap-3 p-4 md:p-5", className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">AI Market Commentary</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        AI commentary arrives with the AI layer, which is not built yet. The signal
        above is complete and deterministic without it — AI explains signals, it
        never generates or gates them (Founding Principle 9).
      </p>
    </Card>
  );
}
