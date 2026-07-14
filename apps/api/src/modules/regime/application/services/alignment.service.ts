import { Injectable } from "@nestjs/common";
import type {
  MarketRegime,
  RegimeClassification,
  Timeframe,
} from "@aegis/contracts";
import { TIMEFRAME_AUTHORITY } from "../../regime.config";

/**
 * Do the timeframes agree with each other?
 *
 * ── The most expensive trade in retail, and this is what prevents it ──
 *
 * A 15-minute bull signal inside a 4-hour downtrend is a **bounce**. It looks
 * perfect — every indicator on the lower timeframe lines up, the structure is clean,
 * momentum is fresh — right up until the higher timeframe reasserts itself and takes
 * it all back plus your stop.
 *
 * That trade is not defeated by a better entry. It is defeated by *looking up*.
 * `conflict` is what makes it visible, and the Risk Engine is entitled to veto on it.
 */
@Injectable()
export class AlignmentService {
  /**
   * How much every timeframe agrees, 0–1.
   *
   * Weighted by authority, so the daily counts for eight times what the 15m does.
   * An unweighted average would let three lower timeframes outvote the daily — which
   * is precisely the mistake this service exists to prevent.
   */
  alignment(
    classifications: Partial<Record<Timeframe, RegimeClassification>>,
  ): number {
    const entries = Object.entries(classifications) as [
      Timeframe,
      RegimeClassification,
    ][];

    if (entries.length === 0) return 0;
    if (entries.length === 1) return 1; // one voice cannot disagree with itself

    let agreeing = 0;
    let total = 0;

    for (const [aTf, a] of entries) {
      for (const [bTf, b] of entries) {
        if (aTf === bTf) continue;

        const weight =
          (TIMEFRAME_AUTHORITY[aTf] ?? 1) * (TIMEFRAME_AUTHORITY[bTf] ?? 1);

        total += weight;
        if (compatible(a.direction, b.direction)) agreeing += weight;
      }
    }

    return total === 0 ? 0 : agreeing / total;
  }

  /**
   * How much the HIGHER timeframes contradict the primary one, 0–1.
   *
   * **Deliberately not `1 - alignment`.** Two timeframes disagreeing matters far more
   * when the bigger one is the dissenter. A 15m that disagrees with the daily is
   * noise; a daily that disagrees with the 15m is a warning, and collapsing them into
   * one symmetric number would throw away the only part that matters.
   *
   * Only timeframes ABOVE the primary can create conflict. A lower timeframe
   * disagreeing with the one you are trading is not a conflict — it is a pullback,
   * and pullbacks are where entries live.
   */
  conflict(
    classifications: Partial<Record<Timeframe, RegimeClassification>>,
    primary: Timeframe,
  ): number {
    const operative = classifications[primary];
    if (!operative) return 0;

    const primaryAuthority = TIMEFRAME_AUTHORITY[primary] ?? 1;

    let dissent = 0;
    let possible = 0;

    for (const [tf, classification] of Object.entries(classifications) as [
      Timeframe,
      RegimeClassification,
    ][]) {
      const authority = TIMEFRAME_AUTHORITY[tf] ?? 1;

      // Only look UP. See above.
      if (authority <= primaryAuthority) continue;

      possible += authority;

      if (opposed(operative.direction, classification.direction)) {
        /*
         * Weighted by the HIGHER timeframe's own agreement, too.
         *
         * A daily that is bearish with 0.9 agreement is a wall. A daily that is
         * bearish with 0.35 agreement is a daily that barely knows what it thinks,
         * and treating the two as an identical veto would have the platform standing
         * down on the strength of a coin flip it happened to run on a big chart.
         */
        dissent += authority * classification.agreement;
      }
    }

    return possible === 0 ? 0 : Math.min(1, dissent / possible);
  }
}

/**
 * Two regimes are COMPATIBLE if they are not pulling against each other.
 *
 * A RANGE is compatible with everything — it is the absence of an opinion, and an
 * absence cannot contradict. This is not laxness: a 4h range under a 1h uptrend is
 * genuinely not a conflict. It means the bigger picture has not decided, which is a
 * different thing from it having decided against you.
 */
function compatible(a: MarketRegime, b: MarketRegime): boolean {
  if (a === b) return true;
  if (a === "RANGE" || b === "RANGE") return true;
  if (a === "TRANSITION" || b === "TRANSITION") return true;

  return !opposed(a, b);
}

/** Actively pulling in opposite directions. */
function opposed(a: MarketRegime, b: MarketRegime): boolean {
  const bullish = (r: MarketRegime) => r === "TRENDING_BULL";
  const bearish = (r: MarketRegime) => r === "TRENDING_BEAR" || r === "RISK_OFF";

  return (bullish(a) && bearish(b)) || (bearish(a) && bullish(b));
}
