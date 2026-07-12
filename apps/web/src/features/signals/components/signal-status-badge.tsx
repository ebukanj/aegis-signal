import { StatusBadge } from "@/components/shared/status-badge";
import { SIGNAL_STATUS_META } from "@/constants/domain";
import type { SignalStatus } from "@/types/domain";

/** Signal lifecycle chip (Active / Triggered / Completed / Stopped / Expired). */
export function SignalStatusBadge({
  status,
  className,
}: {
  status: SignalStatus;
  className?: string;
}) {
  const meta = SIGNAL_STATUS_META[status];
  return (
    <StatusBadge status={meta.status} className={className}>
      {meta.label}
    </StatusBadge>
  );
}
