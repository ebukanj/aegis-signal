import { Injectable } from "@nestjs/common";
import {
  allConditions,
  indicatorKey,
  type Condition,
  type Operand,
  type StrategyDefinition,
  type Timeframe,
} from "@aegis/contracts";
import type { Dependencies } from "../../domain/evaluation-context";

/**
 * What does this document need?
 *
 * Walks the strategy and collects every indicator, every timeframe and whether it
 * touches patterns at all — **before a single thing is computed**.
 *
 * ── Why it is a separate pass ──
 *
 * The lazy alternative is to resolve each operand as the evaluator reaches it. It
 * looks simpler and it is worse in three ways that matter:
 *
 *   · **It serialises the engines.** Every indicator would be fetched one at a time,
 *     in the arbitrary order the rules happen to be written in, when they could all
 *     have been requested at once.
 *
 *   · **It makes cost depend on rule order.** A strategy that fails on its first rule
 *     would compute nothing; the same strategy with its rules swapped would compute
 *     everything. Two documents that mean the same thing would have different
 *     performance, and nobody would know why.
 *
 *   · **It lets two rules judge different moments.** A rule resolved late could see an
 *     indicator computed from a market that has moved since the rule before it. The
 *     document would be evaluated against two different instants, and the result would
 *     be irreproducible — which quietly destroys calibration (ADR-024).
 *
 * So: collect everything, resolve everything, freeze it, then interpret.
 *
 * **The resolver never calculates anything.** It produces a shopping list. The
 * Indicator, Pattern and Regime engines own the arithmetic, and they are the only
 * things that may do it (AGENTS.md §2).
 */
@Injectable()
export class DependencyResolver {
  resolve(strategy: StrategyDefinition): Dependencies {
    const indicators = new Map<string, Dependencies["indicators"][number]>();
    const timeframes = new Set<Timeframe>([strategy.timeframe]);

    let needsPatterns = false;

    for (const condition of allConditions(strategy)) {
      if (condition.kind === "pattern") {
        needsPatterns = true;
        timeframes.add(condition.timeframe ?? strategy.timeframe);
        continue;
      }

      for (const operand of operandsOf(condition)) {
        if (!operand || operand.kind !== "indicator") continue;

        const timeframe = operand.timeframe ?? strategy.timeframe;
        timeframes.add(timeframe);

        /*
         * The key is the identity, and it comes from the CONTRACT.
         *
         * `ema(50)` and `ema(200)` are different indicators. A key that omitted the
         * period would let one overwrite the other in this map, and the strategy would
         * silently be handed the 50 EMA while its document said 200 — a number that is
         * entirely plausible and completely wrong.
         *
         * Deduplicated: a document that mentions RSI(14) five times computes it once.
         */
        const params = paramsOf(operand);
        const key = indicatorKey({
          indicator: operand.indicator,
          timeframe,
          params,
        });

        if (!indicators.has(key)) {
          indicators.set(key, {
            key,
            indicator: operand.indicator,
            timeframe,
            params,
          });
        }
      }
    }

    return {
      indicators: [...indicators.values()],
      timeframes: [...timeframes],
      needsPatterns,
    };
  }

  /**
   * The canonical key for one operand, as the evaluator will look it up.
   *
   * The same function the resolver used to store it. If these two ever disagreed, the
   * evaluator would look up a key that does not exist, every condition would report
   * UNAVAILABLE, and the strategy would go permanently, silently quiet.
   */
  keyFor(operand: Operand, strategyTimeframe: Timeframe): string | null {
    if (operand.kind !== "indicator") return null;

    return indicatorKey({
      indicator: operand.indicator,
      timeframe: operand.timeframe ?? strategyTimeframe,
      params: paramsOf(operand),
    });
  }
}

/** Both sides of a comparison, plus the upper bound if there is one. */
function operandsOf(condition: Condition): (Operand | undefined)[] {
  if (condition.kind !== "comparison") return [];

  return [condition.left, condition.right, condition.rightUpper];
}

/**
 * An operand's parameters, in the shape the Indicator Engine speaks.
 *
 * `multiplier` is deliberately EXCLUDED. It scales the *result* — "volume_sma(20) ×
 * 1.5" — and is not part of the indicator's identity: the underlying series is the
 * same 20-period volume average whether a rule multiplies it by 1.5 or not.
 *
 * Including it would compute the same series twice under two keys, and worse, would
 * make the cache miss on a strategy that merely tweaked a multiplier. The scaling
 * happens at read time, in the evaluator.
 */
function paramsOf(operand: Extract<Operand, { kind: "indicator" }>) {
  return operand.period !== undefined ? { period: operand.period } : {};
}
