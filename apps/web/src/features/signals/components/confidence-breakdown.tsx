import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import type { SignalDetail } from "@/features/signals/types";
import { cn } from "@/lib/utils";

/**
 * Answers: "Where does the confidence number come from?"
 * Confidence is never a mysterious number — every contributor is shown
 * with its own score and a plain-language note (Founding Principle 3).
 */
export function ConfidenceBreakdown({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          Confidence Analysis
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Overall</span>
          <ConfidenceBadge confidence={signal.confidence} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        The overall score is calibrated against how signals with the same
        measured profile performed historically — it is a statement of
        evidence, not opinion.
      </p>

      <ul className="space-y-3.5">
        {signal.confidenceBreakdown.map((contributor) => (
          <li key={contributor.name} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{contributor.name}</span>
              <span className="font-numeric text-sm">{contributor.score}</span>
            </div>
            <Progress
              value={contributor.score}
              className="h-1.5"
              aria-label={`${contributor.name}: ${contributor.score} out of 100`}
            />
            <p className="text-xs text-muted-foreground">{contributor.note}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
