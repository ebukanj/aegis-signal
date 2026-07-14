import { Injectable } from "@nestjs/common";
import {
  riskDecisionSchema,
  type RiskAssessment,
  type RiskDecision,
  type RiskFactor,
  type RiskLevel,
} from "@aegis/contracts";
import type { IRiskValidator, RiskContext, Verdict } from "../../domain/validator";
import { SizingService } from "./sizing.service";
import { ALL_VALIDATORS } from "../validators";

/**
 * THE VETO.
 *
 * Every candidate the platform produces passes through here, and nothing reaches a trader
 * that this pipeline did not check. **If it says no, the platform says no**, and no other
 * engine may overrule it.
 *
 * ── The gates run in a deliberate order, and the order is not an optimisation ──
 *
 * Cheap and structural first (is this candidate even coherent? is the exchange alive? is
 * the evidence stale?), then market conditions, then the trade's own arithmetic. A
 * candidate rejected for a bad spread never gets its leverage computed, and — far more
 * importantly — a trader reading a rejection sees the *most fundamental* reason it died,
 * not the first one an arbitrary loop happened to reach.
 *
 * "Rejected: R:R is 1.2" is a useless thing to tell someone whose exchange is down.
 *
 * ── EVERY gate runs, even after one has vetoed ──
 *
 * The pipeline does not short-circuit. It costs microseconds and it buys the complete
 * picture: a trade that failed on spread AND liquidity AND regime is a different trade
 * from one that failed on spread alone, and an operator watching the platform go quiet
 * needs to see all of it. The FIRST veto is the decision; the rest are the diagnosis.
 */
@Injectable()
export class RiskPipeline {
  constructor(private readonly sizing: SizingService) {}

  decide(context: RiskContext): RiskDecision {
    const verdicts = new Map<IRiskValidator, Verdict>();

    for (const validator of ALL_VALIDATORS) {
      verdicts.set(validator, validator.validate(context));
    }

    const factors = this.factors(verdicts);
    const warnings = this.warnings(verdicts);
    const unassessed = this.unassessed(verdicts);

    /* ── The veto ────────────────────────────────────────────────── */

    // The FIRST veto in pipeline order — the most fundamental reason it died.
    const vetoed = [...verdicts.entries()].find(
      ([, verdict]) => verdict.kind === "VETO",
    );

    if (vetoed) {
      const verdict = vetoed[1] as Extract<Verdict, { kind: "VETO" }>;

      /*
       * Every other veto is appended to the reason.
       *
       * A trade that failed three gates is not the same as a trade that failed one, and
       * hiding the other two would make the platform look like it was rejecting on a
       * technicality when it was actually rejecting on everything.
       */
      const others = [...verdicts.values()]
        .filter((v): v is Extract<Verdict, { kind: "VETO" }> => v.kind === "VETO")
        .slice(1);

      const reason =
        others.length > 0
          ? `${verdict.reason}. Also failed: ${others.map((v) => v.reason).join("; ")}`
          : verdict.reason;

      return riskDecisionSchema.parse({
        approved: false,
        gate: verdict.gate,
        reason,
        decidedAt: new Date(context.now).toISOString(),
      });
    }

    /* ── Leverage ────────────────────────────────────────────────── */

    const leverage = this.sizing.leverage({
      candidate: context.candidate,
      strategy: context.strategy,
      policy: context.policy,
    });

    /*
     * A PERPETUAL with no safe leverage is a VETO.
     *
     * `leverage()` returns null when not even 1× keeps liquidation clear of the stop. The
     * honest response is not "trade it at 1× anyway" — it is to refuse, because the whole
     * point of the recommendation is that the stop must decide the trade rather than the
     * exchange.
     */
    if (context.candidate.market === "PERPETUAL" && leverage === null) {
      return riskDecisionSchema.parse({
        approved: false,
        gate: "LIQUIDATION_RISK",
        reason:
          "there is no leverage at which liquidation stays safely beyond the stop — at every level the exchange would close this position before the trade was ever proven wrong, and the stop would be decoration",
        decidedAt: new Date(context.now).toISOString(),
      });
    }

    /* ── Approved ────────────────────────────────────────────────── */

    const sizing = this.sizing.size({
      candidate: context.candidate,
      strategy: context.strategy,
      policy: context.policy,
      leverage: leverage?.suggested ?? null,
    });

    const assessment: RiskAssessment = {
      level: this.level(factors),
      score: this.score(verdicts),
      factors,
      limits: {
        /*
         * Zeroes, and they are HONEST zeroes.
         *
         * There is no ledger, so there are no open positions and no portfolio heat. These
         * are not "everything is fine" — they are "there is nothing to be exposed to yet",
         * and the `unassessed` list says so in words rather than leaving a trader to infer
         * it from a zero.
         */
        portfolioHeatPercent: 0,
        portfolioHeatCap: 4,
        correlatedPositions: 0,
        correlatedPositionCap: 3,
        openPositions: 0,
      },
      warnings,
      unassessed,
    };

    return riskDecisionSchema.parse({
      approved: true,
      direction: context.candidate.direction,
      marketType: context.candidate.market,
      leverage,
      sizing,
      assessment,
      decidedAt: new Date(context.now).toISOString(),
    });
  }

  /* ── The assessment ──────────────────────────────────────────────── */

  private factors(verdicts: Map<IRiskValidator, Verdict>): RiskFactor[] {
    return [...verdicts.entries()].map(([validator, verdict]) => {
      if (verdict.kind === "UNASSESSED") {
        return {
          name: validator.name,
          rating: "ELEVATED" as RiskLevel,
          measured: "not measured",
          note: verdict.reason,
          /*
           * `available: false` — the contract's own words: "A missing measurement must
           * read as MISSING, never as FINE."
           *
           * Rated ELEVATED rather than LOW, deliberately. An unknown risk is not a small
           * one, and a factor that could not be checked must never make the trade look
           * safer than a factor that was checked and passed.
           */
          available: false,
        };
      }

      if (verdict.kind === "VETO") {
        return {
          name: validator.name,
          rating: "HIGH" as RiskLevel,
          measured: verdict.reason,
          note: "this gate vetoed the trade",
          available: true,
        };
      }

      return {
        name: validator.name,
        rating: verdict.rating,
        measured: verdict.measured,
        note: verdict.warning ?? "acceptable",
        available: true,
      };
    });
  }

  private warnings(verdicts: Map<IRiskValidator, Verdict>): string[] {
    return [...verdicts.values()]
      .filter((v): v is Extract<Verdict, { kind: "PASS" }> => v.kind === "PASS")
      .map((v) => v.warning)
      .filter((w): w is string => w !== undefined);
  }

  private unassessed(verdicts: Map<IRiskValidator, Verdict>): string[] {
    return [...verdicts.values()]
      .filter((v): v is Extract<Verdict, { kind: "UNASSESSED" }> => v.kind === "UNASSESSED")
      .map((v) => v.reason);
  }

  /**
   * The aggregate risk score, 0–100. **Higher is worse.**
   *
   * ── Risk is not confidence, and this is not a probability ──
   *
   * A risk score of 21 does not mean the trade wins 79% of the time. It means the
   * *conditions around* the trade are clean — the book is deep, the spread is tight, the
   * regime fits, the stop is sane. A brilliant setup in a terrible market and a mediocre
   * setup in a perfect one are different questions, and this answers only the second.
   *
   * Conflating them is how a platform ends up telling a trader that a low-risk trade is a
   * likely winner, which is a sentence with no meaning in it.
   *
   * An UNASSESSED gate counts as ELEVATED. It must never make a trade look safer than one
   * whose risks were actually measured.
   */
  private score(verdicts: Map<IRiskValidator, Verdict>): number {
    const HEAT: Record<RiskLevel, number> = {
      LOW: 10,
      MODERATE: 35,
      ELEVATED: 65,
      HIGH: 100,
    };

    let weighted = 0;
    let total = 0;

    for (const [validator, verdict] of verdicts) {
      if (validator.weight <= 0) continue;

      const rating: RiskLevel =
        verdict.kind === "PASS"
          ? verdict.rating
          : verdict.kind === "UNASSESSED"
            ? "ELEVATED"
            : "HIGH";

      weighted += HEAT[rating] * validator.weight;
      total += validator.weight;
    }

    return total === 0 ? 0 : Math.round(weighted / total);
  }

  /**
   * The headline level.
   *
   * Takes the WORST available factor, not the average. A trade with excellent liquidity,
   * an excellent spread and a stop sitting inside the noise is not a "mostly good" trade —
   * averaging would let the two strong factors carry the fatal one, and the fatal one is
   * the one that empties the account.
   */
  private level(factors: RiskFactor[]): RiskLevel {
    const ORDER: RiskLevel[] = ["LOW", "MODERATE", "ELEVATED", "HIGH"];

    let worst = 0;

    for (const factor of factors) {
      if (!factor.available) continue;

      worst = Math.max(worst, ORDER.indexOf(factor.rating));
    }

    return ORDER[worst];
  }
}
