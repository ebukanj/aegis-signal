import { StatusBadge } from "@/components/shared/status-badge";
import { STRATEGY_STATUS_META } from "@/constants/domain";
import type { StrategyStatus } from "@/features/strategies/types";

/** Strategy lifecycle chip (Active / Probation / Disabled). */
export function StrategyStatusBadge({
  status,
  className,
}: {
  status: StrategyStatus;
  className?: string;
}) {
  const meta = STRATEGY_STATUS_META[status];
  return (
    <StatusBadge status={meta.status} className={className}>
      {meta.label}
    </StatusBadge>
  );
}
