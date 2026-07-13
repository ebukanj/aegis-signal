import { StatusBadge } from "@/components/shared/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CalibrationBasis } from "@aegis/contracts";

/**
 * Confidence color bands (DESIGN_SYSTEM.md — color communicates meaning):
 * 90–100 green · 75–89 blue · 60–74 amber · below 60 gray.
 */
function bandFor(score: number) {
  if (score >= 90) return "success" as const;
  if (score >= 75) return "info" as const;
  if (score >= 60) return "warning" as const;
  return "neutral" as const;
}

const BASIS_MEANING: Record<CalibrationBasis, string> = {
  UNCALIBRATED:
    "This is a score, not a win rate. It is the sum of the rules this setup satisfied — but we have no settled signals yet, so we cannot tell you how often a score like this actually wins. We will not pretend otherwise.",
  HISTORICAL:
    "Measured by replaying this strategy over exchange history. Real, but optimistic: history is not the same as our own live results.",
  BLENDED:
    "History plus our own live results, weighted toward live as they accumulate.",
  LIVE:
    "Measured from our own settled signals at this score. History is no longer used.",
};

interface ConfidenceBadgeProps {
  /** The raw score — the sum of the contributors. Always shown. */
  score: number;
  /**
   * The win rate we have earned the right to display, or null.
   *
   * Null is the honest default and it stays null until the ledger says
   * otherwise. Before ADR-024 this component rendered a random number as though
   * it were a probability. It cannot any more: without a rate, it shows a score
   * and no percent sign.
   */
  displayedWinRate?: number | null;
  basis?: CalibrationBasis;
  className?: string;
}

export function ConfidenceBadge({
  score,
  displayedWinRate = null,
  basis = "UNCALIBRATED",
  className,
}: ConfidenceBadgeProps) {
  const calibrated = displayedWinRate !== null;

  const badge = (
    <StatusBadge
      status={bandFor(score)}
      dot={false}
      className={className}
      aria-label={
        calibrated
          ? `Score ${score}, wins ${displayedWinRate} percent of the time`
          : `Score ${score} out of 100, uncalibrated — not a win rate`
      }
    >
      <span className="font-numeric">{score}</span>
      {calibrated ? (
        <span className="ml-1 font-numeric opacity-80">
          · {displayedWinRate}%
        </span>
      ) : (
        <span className="ml-1 text-[9px] uppercase tracking-wide opacity-70">
          uncal.
        </span>
      )}
    </StatusBadge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {BASIS_MEANING[basis]}
      </TooltipContent>
    </Tooltip>
  );
}
