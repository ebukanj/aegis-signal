import { StatusBadge } from "@/components/shared/status-badge";
import type { SignalDirection } from "@/types/domain";

interface DirectionBadgeProps {
  direction: SignalDirection;
  className?: string;
}

/** LONG/SHORT chip — semantic color always paired with a direction glyph. */
export function DirectionBadge({ direction, className }: DirectionBadgeProps) {
  const isLong = direction === "LONG";
  return (
    <StatusBadge
      status={isLong ? "long" : "short"}
      dot={false}
      className={className}
    >
      {isLong ? "▲ LONG" : "▼ SHORT"}
    </StatusBadge>
  );
}
