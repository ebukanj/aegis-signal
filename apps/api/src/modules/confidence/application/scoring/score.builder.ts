import { Injectable } from "@nestjs/common";
import type { ConfidenceContributor } from "@aegis/contracts";
import { ALL_CONTRIBUTORS } from "../contributors/contributors";
import type { ScoringContext } from "../../domain/scoring";

export interface RawScore {
  readonly score: number;
  readonly contributors: readonly ConfidenceContributor[];
}

/**
 * Contributors → a score.
 *
 * ── This function must be BIT-IDENTICAL in the replay and in production ──
 *
 * It is called from exactly two places: the replay runner, which produces the
 * scores a calibration model is fitted on, and the confidence pipeline, which
 * produces the scores that model is applied to. If those two ever diverge, the
 * model becomes a lookup table built for one quantity and applied to another,
 * and every published probability is quietly wrong while everything still
 * appears to work.
 *
 * That is why there is one builder and not two, why `ScoringContext` cannot even
 * hold an order book, and why this class has no state, no clock and no I/O.
 */
@Injectable()
export class ScoreBuilder {
  build(context: ScoringContext): RawScore {
    const contributors: ConfidenceContributor[] = [];

    /*
     * ══════════════════════════════════════════════════════════════════════
     *  THE BASE IS A CONSTANT — AND THIS IS A DELIBERATE DEPARTURE FROM
     *  ADR-024's SKETCH, FOR A REASON THAT ONLY APPEARS ONCE YOU BUILD IT
     * ══════════════════════════════════════════════════════════════════════
     *
     * ADR-024 illustrates the breakdown starting from a base equal to the
     * strategy's historical win rate:
     *
     *     Base — Breakout's win rate in an uptrend      52   (from 340 setups)
     *
     * It cannot work, and the reason is not a detail:
     *
     * **1 · It is circular.** The calibration model maps SCORE → WIN RATE. If the
     *    score already contains a win rate, then every refit changes the scores
     *    that the next refit is fitted on. Model v2 is trained on scores produced
     *    by v1. A replayed setup's score would depend on which model happened to be
     *    live the day it was replayed, and the replay would stop being reproducible
     *    — killing "Deterministic Replay", which is an acceptance criterion of this
     *    very milestone.
     *
     * **2 · It cannot exist in the corpus.** The base IS the historical win rate,
     *    which is the thing the replay is computing. During the replay there is no
     *    such number to add. So live scores would carry a base and corpus scores
     *    would not — the two distributions would be shifted apart by tens of
     *    points, and the calibration model would be a lookup table built for one
     *    quantity and applied to another. Every published probability would be
     *    quietly wrong while every test still passed.
     *
     * So the base is a CONSTANT, identical in the replay and in production, and
     * history enters where it belongs: in the calibration that turns this score
     * into a probability, and in the strategy's record reported alongside it.
     *
     * 50 is not a claim that the trade is a coin flip. **The score is not a
     * probability.** It is the middle of the range the contributors move within,
     * and it means nothing more than that until the calibration says what it has
     * historically been worth.
     */
    contributors.push({
      name: "Base",
      weight: context.policy.neutralBase,
      source: "RULE",
      measured: `${context.policy.neutralBase}`,
      note: "the midpoint the evidence moves from — NOT a claim that the trade is a coin flip. A score is not a probability.",
    });

    /*
     * The strategy's own record, REPORTED and worth zero points.
     *
     * A trader must see that Breakout has won 52% of 340 replayed setups in this
     * regime — it is among the most useful things the platform knows. But it must
     * not move the score, for the two reasons above. It informs; it does not price.
     *
     * Absent during the replay (there is no record yet to report), and worth zero
     * points there and here — so the score is bit-identical in both worlds, which
     * is the invariant the whole calibration rests on.
     */
    const record = context.historicalBase;

    if (record) {
      contributors.push({
        name: "This strategy, in this market",
        weight: 0,
        source: "HISTORICAL",
        measured: `won ${(record.winRate * 100).toFixed(0)}% of ${record.samples} replayed setups in this regime`,
        note: "replayed over exchange history — real, and optimistic, because the rules were written by people who had already lived through it. It is reported, not charged for.",
      });
    }

    for (const contributor of ALL_CONTRIBUTORS) {
      const line = contributor.contribute(context);
      /*
       * null means "there was nothing here to look at" — no pattern on this bar,
       * no other strategy agreeing. It is NOT zero. A zero in the breakdown reads
       * as "we looked and it was neutral", which is a different claim, and a
       * breakdown padded with neutral zeroes is a breakdown that hides how little
       * evidence there actually was.
       */
      if (line !== null) contributors.push(line);
    }

    const sum = contributors.reduce((total, c) => total + c.weight, 0);

    /*
     * The contract's `confidenceSchema` is an integer 0–100. Clamping is not
     * cosmetic: a score of 104 would fall outside every calibration bucket and
     * the lookup would silently return nothing.
     */
    const score = Math.max(0, Math.min(100, Math.round(sum)));

    return { score, contributors };
  }
}
