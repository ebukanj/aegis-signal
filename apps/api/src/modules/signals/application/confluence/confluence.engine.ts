import { Injectable } from "@nestjs/common";
import type {
  ConfidenceContributor,
  ConfluenceContributor,
  ConfluenceReport,
} from "@aegis/contracts";
import type { SignalCandidate } from "../../domain/intake";

/**
 * The heart of the Signal Engine: how much does the evidence AGREE?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  CONFLUENCE IS NOT CONFIDENCE, AND THIS ENGINE RECOMPUTES NOTHING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Confidence (M09) asks: *has a setup like this WON before?* — a probability,
 * earned from outcomes. Confluence asks a different question entirely: *does the
 * evidence in front of us AGREE with itself, right now?* — a coherence measure.
 *
 * A trade can have high confidence and low confluence (history says setups like
 * this win, but half the timeframes are pointing the other way today), or high
 * confluence and low confidence (everything lines up, but we have no history to
 * say whether it matters). They are orthogonal, and merging them would double-
 * count the same evidence and call the result conviction.
 *
 * The critical discipline: this engine reads ONLY what upstream already produced —
 * the confidence contributors, the risk factors, the multi-timeframe alignment the
 * Regime Engine computed. It does not touch a candle. It does not recompute an
 * EMA, re-detect a pattern, or re-run the risk gates. It weighs signed evidence
 * that already exists and reports how aligned it is. If it recomputed anything,
 * there would be two sources of truth for one number, and the moment there are two
 * they drift (AGENTS.md §2).
 */
@Injectable()
export class ConfluenceEngine {
  /**
   * Each dimension of agreement, the weight it carries, and — crucially — the
   * NAME of the already-computed confidence contributor it reads. Nothing here
   * measures the market; it re-reads a measurement.
   *
   * Weights sum to 1, so the agreement is a clean weighted average bounded to
   * 0–100.
   */
  private static readonly DIMENSIONS: ReadonlyArray<{
    name: string;
    weight: number;
    reads: string;
  }> = [
    { name: "Market regime", weight: 0.18, reads: "Market regime" },
    { name: "Trend alignment", weight: 0.18, reads: "Trend alignment" },
    { name: "Pattern quality", weight: 0.14, reads: "Pattern quality" },
    { name: "Momentum", weight: 0.12, reads: "Momentum" },
    { name: "Risk quality", weight: 0.12, reads: "Risk quality" },
    { name: "Volume", weight: 0.1, reads: "Volume confirmation" },
    { name: "Structure", weight: 0.08, reads: "Structure" },
    { name: "Volatility", weight: 0.08, reads: "Volatility" },
  ];

  evaluate(intake: SignalCandidate, agreeingStrategies: readonly string[]): ConfluenceReport {
    const byName = new Map<string, ConfidenceContributor>();
    for (const c of intake.confidence.confidence.contributors) {
      byName.set(c.name, c);
    }

    const contributors: ConfluenceContributor[] = [];

    for (const dimension of ConfluenceEngine.DIMENSIONS) {
      const source = byName.get(dimension.reads);

      if (!source) {
        /*
         * The dimension has nothing to say — no pattern on this bar, for instance.
         * It is NEUTRAL (agrees 0), not absent: missing corroboration is not
         * corroboration, and a bar with no pattern should not score as if the
         * pattern agreed. Neutral pulls the confluence toward the middle, which is
         * the honest effect of an absent dimension.
         */
        contributors.push({
          name: dimension.name,
          weight: dimension.weight,
          agrees: 0,
          measured: "not present on this bar",
        });
        continue;
      }

      contributors.push({
        name: dimension.name,
        weight: dimension.weight,
        /*
         * The confidence contributor's POINTS, normalised to −1…+1. A +10
         * contributor is full agreement, a −10 is full disagreement, and the
         * clamp keeps an unusually large contributor from dominating. This reads
         * the sign AND the strength of a number the Confidence Engine already
         * computed — it derives nothing new.
         */
        agrees: clamp(source.weight / 10, -1, 1),
        measured: source.measured,
      });
    }

    /*
     * Trend alignment gets a second opinion the confidence breakdown cannot give:
     * the Regime Engine's raw multi-timeframe alignment/conflict. The confidence
     * contributor already folds this in, but the raw figure is the more direct
     * statement of "do the timeframes agree", so it OVERRIDES the derived one for
     * that single dimension.
     */
    const trend = contributors.find((c) => c.name === "Trend alignment")!;
    trend.agrees = clamp(intake.market.alignment - intake.market.conflict, -1, 1);
    trend.measured = `${(intake.market.alignment * 100).toFixed(0)}% of timeframes aligned, ${(intake.market.conflict * 100).toFixed(0)}% in conflict`;

    /* Weighted agreement, mapped from −1…+1 onto 0–100. */
    const weighted = contributors.reduce(
      (sum, c) => sum + c.weight * c.agrees,
      0,
    );
    let score = Math.round(((weighted + 1) / 2) * 100);

    /*
     * ── Cross-strategy corroboration ──────────────────────────────────
     *
     * Everything above measures the coherence of ONE candidate's evidence. This is
     * the other kind of confluence, and the more valuable one: independent
     * strategies — plugins that never communicate (Founding Principle 4) — arriving
     * at the same conclusion separately.
     *
     * Two strategies agreeing is genuine corroboration and it lifts the confluence
     * score. But it is a bounded, modest lift, NOT the old `+4 per strategy` that
     * ADR-024 deleted, and it moves the CONFLUENCE measure (agreement), never the
     * CONFIDENCE (probability). What agreement is worth in win rate is unknown
     * until the ledger measures it — see `uplift` below, which stays zero.
     */
    const others = agreeingStrategies.filter(
      (id) => id !== intake.candidate.strategyId,
    );

    if (others.length > 0) {
      score = Math.min(100, score + Math.min(others.length, 3) * 4);
      contributors.push({
        name: "Strategy confluence",
        weight: 0,
        agrees: 1,
        measured: `${others.length + 1} independent strategies agree (${[intake.candidate.strategyId, ...others].join(", ")})`,
      });
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      contributors,
      agreeingStrategies: [intake.candidate.strategyId, ...others],
      /*
       * ZERO, and it must be. The confidence UPLIFT from confluence is a claim
       * about OUTCOMES — "signals where two strategies agreed won more often" — and
       * no such measurement exists yet. Until the ledger prices it, agreement is
       * worth nothing to the win rate (ADR-024 §6). Confluence lifts the ranking,
       * never the probability.
       */
      uplift: 0,
    };
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
