import { Injectable } from "@nestjs/common";
import type { SignalPolicy } from "../../signal.policy";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/** The identity of an opportunity, for duplicate detection. */
export interface OpportunityKey {
  readonly symbol: string;
  readonly direction: string;
  readonly timeframe: string;
  readonly entryPrice: number;
  readonly barTime: number;
}

/**
 * One opportunity, seen once.
 *
 * ── Why a signal product needs this at all ──
 *
 * The same real opportunity announces itself many times. A strategy fires on one
 * bar and again on the next as the condition persists; two strategies with similar
 * logic both fire on the same breakout; the pipeline re-runs after a reconnect and
 * re-evaluates a bar it already saw. Without deduplication, a trader gets three
 * notifications for one trade, learns the platform is noisy, and stops trusting it.
 *
 * Confluence (the fusion stage) already merges DIFFERENT strategies agreeing on
 * one opportunity into a single credited signal. This is the other half: the SAME
 * opportunity recurring, which must collapse to one — and thanks to deterministic
 * ids, an exact re-run collapses for free. This catches the NEAR-duplicates ids
 * alone would miss: a LONG at 60,000 and a LONG at 60,020 two bars later are not
 * two trades, they are one seen twice.
 */
@Injectable()
export class DeduplicationService {
  /**
   * Is `candidate` a duplicate of something in `seen` (already published, or a
   * stronger sibling kept earlier this pass)?
   *
   * "The same" means: same symbol, same direction, same timeframe, an entry within
   * the policy's zone tolerance, and a bar within the policy's window. All four,
   * because a LONG and a SHORT at the same price are opposite trades, and the same
   * setup a week apart is two genuine opportunities.
   */
  isDuplicate(
    candidate: OpportunityKey,
    seen: readonly OpportunityKey[],
    policy: SignalPolicy,
  ): { duplicate: false } | { duplicate: true; of: OpportunityKey; reason: string } {
    const barMs = timeframeMs(candidate.timeframe as never);

    for (const prior of seen) {
      if (prior.symbol !== candidate.symbol) continue;
      if (prior.direction !== candidate.direction) continue;
      if (prior.timeframe !== candidate.timeframe) continue;

      const zonePercent =
        (Math.abs(prior.entryPrice - candidate.entryPrice) / candidate.entryPrice) * 100;
      if (zonePercent > policy.dedupe.entryZonePercent) continue;

      const barsApart = Math.abs(prior.barTime - candidate.barTime) / barMs;
      if (barsApart > policy.dedupe.withinBars) continue;

      return {
        duplicate: true,
        of: prior,
        reason:
          `a ${candidate.direction} on ${candidate.symbol} (${candidate.timeframe}) at ${candidate.entryPrice} ` +
          `is the same opportunity as one already taken at ${prior.entryPrice} ` +
          `(${zonePercent.toFixed(2)}% apart, ${barsApart.toFixed(0)} bar(s) apart) — one trade, not two`,
      };
    }

    return { duplicate: false };
  }
}
