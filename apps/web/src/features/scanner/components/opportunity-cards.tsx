"use client";

import { Zap } from "lucide-react";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RISK_META } from "@/constants/domain";
import type { Opportunity } from "@/features/scanner/types";
import { formatPrice, formatRelativeTime } from "@/lib/format";

interface OpportunityCardsProps {
  opportunities: Opportunity[];
  loading: boolean;
  onPreview: (opportunity: Opportunity) => void;
}

/** Mobile presentation of the opportunity list — tap a card for details. */
export function OpportunityCards({
  opportunities,
  loading,
  onPreview,
}: OpportunityCardsProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <EmptyState
        title="No opportunities match your filters"
        description="Loosen the filters, or wait for the next scan."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {opportunities.map((opp) => {
        const risk = RISK_META[opp.riskLevel];
        return (
          <li key={opp.id}>
            <Card
              role="button"
              tabIndex={0}
              onClick={() => onPreview(opp)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPreview(opp);
                }
              }}
              aria-label={`Preview ${opp.pair} ${opp.direction}`}
              className="cursor-pointer gap-2.5 p-3 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-numeric text-xs text-muted-foreground">
                    #{opp.rank}
                  </span>
                  <div>
                    <p className="flex items-center gap-1 text-sm font-medium leading-none">
                      {opp.pair}
                      {opp.isPrime && (
                        <Zap
                          className="size-3.5 fill-warning text-warning"
                          aria-label="Prime signal"
                        />
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {opp.exchange} · {opp.strategies.join(" + ")} ·{" "}
                      {opp.timeframe} ·{" "}
                      {opp.marketType === "SPOT"
                        ? "Spot"
                        : `${opp.suggestedLeverage}x`}
                    </p>
                  </div>
                </div>
                <DirectionBadge direction={opp.direction} />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <ConfidenceBadge confidence={opp.confidence} />
                <StatusBadge status={risk.status}>{risk.label} risk</StatusBadge>
                <span className="font-numeric ml-auto text-xs text-muted-foreground">
                  {formatRelativeTime(opp.generatedAt)}
                </span>
              </div>

              <div className="font-numeric flex items-center justify-between text-xs">
                <span>
                  E <span className="text-foreground">{formatPrice(opp.entryPrice)}</span>
                </span>
                <span>
                  SL <span className="text-short">{formatPrice(opp.stopLoss)}</span>
                </span>
                <span>
                  TP <span className="text-long">{formatPrice(opp.takeProfit)}</span>
                </span>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
