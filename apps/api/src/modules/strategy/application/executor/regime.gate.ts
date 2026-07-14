import { Injectable } from "@nestjs/common";
import type { StrategyDefinition } from "@aegis/contracts";
import { CompatibilityService } from "../../../regime/application/services/compatibility.service";
import type { EvaluationContext } from "../../domain/evaluation-context";

/**
 * Is this strategy even allowed to ask?
 *
 * Checked before a single rule is read. A strategy standing in the wrong market has
 * not "failed its conditions" — it was never permitted to have any.
 *
 * The gate has NO OPINIONS of its own. It reads what the strategy DECLARED
 * (`regimes` / `avoidRegimes`, M06) and what the Regime Engine reports. A lookup table
 * of "which strategies suit a bull trend" living in here would make every
 * user-authored strategy invisible to it — and ADR-023 would be a slogan.
 */
@Injectable()
export class RegimeGate {
  constructor(private readonly compatibility: CompatibilityService) {}

  check(
    strategy: StrategyDefinition,
    context: EvaluationContext,
  ): { regime: EvaluationContext["regime"]; allowed: boolean; reason: string } {
    const verdict = this.compatibility.verdict(strategy, context.regime);

    if (!verdict.compatible) {
      return {
        regime: context.regime,
        allowed: false,
        reason: verdict.reason,
      };
    }

    /*
     * ── THE HIGHER-TIMEFRAME VETO ──
     *
     * Every rule can pass on the strategy's own timeframe while the daily is screaming
     * the other way. That trade is a **bounce**, and it is the most expensive one in
     * retail: the lower timeframe looks perfect right up until the higher one
     * reasserts itself and takes it all back plus the stop.
     *
     * `conflict` (M06) is weighted so a daily's objection counts for far more than a
     * 15m's, and it is scaled by how sure the higher timeframe actually is — a daily
     * that barely knows its own mind does not get to veto anything.
     *
     * This is a REJECTION, not a warning. A strategy is entitled to be right about its
     * own timeframe and still not be allowed to trade.
     */
    if (context.market.conflict >= MAX_CONFLICT) {
      const dissenters = Object.entries(context.market.timeframes)
        .filter(([tf]) => tf !== context.timeframe)
        .map(([tf, c]) => `${tf} is ${c.direction}`)
        .join(", ");

      return {
        regime: context.regime,
        allowed: false,
        reason:
          `the ${context.timeframe} says ${context.regime}, but the higher timeframes disagree (${dissenters}) — ` +
          `conflict ${context.market.conflict.toFixed(2)}. Trading this is trading a bounce.`,
      };
    }

    return {
      regime: context.regime,
      allowed: true,
      reason: verdict.reason,
    };
  }
}

/**
 * How much higher-timeframe dissent is too much.
 *
 * 0.5 means "the weight of the bigger charts arguing against you, scaled by how sure
 * they are, has reached half". A real trade-off: lower and the platform stands down
 * whenever the daily so much as hesitates; higher and it will happily buy a 15m rally
 * inside a daily collapse.
 */
const MAX_CONFLICT = 0.5;
