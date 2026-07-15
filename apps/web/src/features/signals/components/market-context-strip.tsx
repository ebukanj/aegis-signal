import { StatusBadge } from "@/components/shared/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { REGIME_META, RISK_META } from "@/constants/domain";
import { formatRelativeTime } from "@/lib/format";
import type { ScanContext } from "@aegis/contracts";

/**
 * Market context, in one line.
 *
 * This is everything that survived the Dashboard (ADR-023). A trader needs to
 * know the regime and the risk before they read a signal — they do not need a
 * page of cards about it.
 */
export function MarketContextStrip({
  context,
  primeCount,
}: {
  context: ScanContext;
  primeCount: number;
}) {
  const regime = REGIME_META[context.regime];
  const risk = RISK_META[context.riskLevel];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
      {/* "Regime" is quant jargon and never appears on screen. The label is
          plain English; the explanation is one hover away. */}
      <div className="flex items-center gap-2">
        <span className="label-caps text-muted-foreground">Market</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">
              <StatusBadge status={regime.status}>{regime.label}</StatusBadge>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {regime.meaning}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2">
        <span className="label-caps text-muted-foreground">Risk</span>
        <StatusBadge status={risk.status}>{risk.label}</StatusBadge>
      </div>

      <div className="flex items-center gap-2">
        <span className="label-caps text-muted-foreground">Today</span>
        <span className="font-numeric font-medium">
          {primeCount} {primeCount === 1 ? "signal" : "signals"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <span className="font-numeric">{context.pairsScanned}</span> pairs ·
        scanned {formatRelativeTime(context.lastScanAt)}
      </div>
    </div>
  );
}
