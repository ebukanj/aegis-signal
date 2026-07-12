import { StatusBadge } from "@/components/shared/status-badge";

/**
 * Confidence color bands (DESIGN_SYSTEM.md — color communicates meaning):
 * 90–100 green · 75–89 blue · 60–74 amber · below 60 gray.
 */
function bandFor(confidence: number) {
  if (confidence >= 90) return "success" as const;
  if (confidence >= 75) return "info" as const;
  if (confidence >= 60) return "warning" as const;
  return "neutral" as const;
}

interface ConfidenceBadgeProps {
  confidence: number; // 0–100
  className?: string;
}

/** Confidence score chip. The number is always shown — never color alone. */
export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  return (
    <StatusBadge
      status={bandFor(confidence)}
      dot={false}
      className={className}
      aria-label={`Confidence ${confidence} out of 100`}
    >
      <span className="font-numeric">{confidence}</span>
    </StatusBadge>
  );
}
