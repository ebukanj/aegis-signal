import { mockOpportunities } from "@/features/scanner/data/mock-opportunities";
import type { Opportunity } from "@/features/scanner/types";
import type { MarketRegime, RiskLevel } from "@/types/domain";

/**
 * Today's signals — the platform's single output (AGENTS.md §1).
 *
 * Two tiers, and the distinction is the whole product:
 *
 *   PRIME     the ~4–5 signals a day that clear the confidence floor and come
 *             from a proven strategy. These are what a trader acts on, and the
 *             only ones that trigger a notification (ADR-021).
 *   VALIDATED everything else that passed risk validation. Visible for
 *             transparency, never pushed.
 *
 * A day with zero Prime signals is a successful day if the rules produced
 * zero. The UI must say so plainly rather than apologise.
 */

export interface ScanContext {
  regime: MarketRegime;
  riskLevel: RiskLevel;
  /** Pairs examined on the last sweep. */
  pairsScanned: number;
  exchanges: number;
  strategiesActive: number;
  lastScanAt: string;
}

export interface TodaysSignals {
  context: ScanContext;
  prime: Opportunity[];
  validated: Opportunity[];
}

export function getMockTodaysSignals(): TodaysSignals {
  const live = mockOpportunities.filter((o) => o.status !== "WATCHLIST");

  return {
    context: {
      regime: "TRENDING_BULL",
      riskLevel: "MODERATE",
      pairsScanned: 247,
      exchanges: 5,
      strategiesActive: 4,
      lastScanAt: new Date(Date.now() - 42_000).toISOString(),
    },
    prime: live.filter((o) => o.isPrime),
    validated: live.filter((o) => !o.isPrime).slice(0, 12),
  };
}
