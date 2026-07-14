import { Injectable } from "@nestjs/common";
import {
  BAR_COUNT_OPERATORS,
  RANGE_OPERATORS,
  describeCondition,
  type Condition,
  type Operand,
  type RuleOutcome,
  type Timeframe,
} from "@aegis/contracts";
import { OperatorEvaluator } from "../../../indicators/application/services/operator.evaluator";
import { DivergenceEngine } from "../../../indicators/application/services/divergence.engine";
import type { Maybe } from "../../../indicators/application/math/rolling";
import type { EvaluationContext } from "../../domain/evaluation-context";
import { DependencyResolver } from "../resolver/dependency.resolver";

/**
 * One condition, judged.
 *
 * ── There is no `switch (strategy)` in this file, and there never will be ──
 *
 * That is the whole of ADR-023 and the point of the milestone. This executor has
 * never heard of "Breakout" or "Pattern Break". It knows a `Condition` — a shape from
 * the contract — and it knows how to ask the engines about one. A new strategy is a
 * new *document*; it is not a new code path, and it cannot be, because there is
 * nowhere in here for one to live.
 *
 * The operators themselves are not implemented here either. They belong to the
 * Indicator Engine's `OperatorEvaluator` (M04) — one implementation of "crosses
 * above", used by everything. Two would drift, and then a backtest and a live
 * evaluation would disagree about whether a cross happened.
 */
@Injectable()
export class ConditionExecutor {
  constructor(
    private readonly operators: OperatorEvaluator,
    private readonly divergence: DivergenceEngine,
    private readonly resolver: DependencyResolver,
  ) {}

  execute(condition: Condition, context: EvaluationContext): RuleOutcome {
    const description = describeCondition(condition);

    try {
      return condition.kind === "pattern"
        ? this.pattern(condition, context, description)
        : this.comparison(condition, context, description);
    } catch (error) {
      /*
       * A thrown condition is UNAVAILABLE, never FAILED.
       *
       * The distinction is the difference between "the market said no" and "we were
       * blind". A strategy that reports FAILED when it could not see would show a
       * mysteriously low pass rate and nothing to explain it; UNAVAILABLE puts the
       * data problem where an operator will find it.
       */
      return {
        description,
        outcome: "UNAVAILABLE",
        evidence:
          error instanceof Error
            ? `could not be evaluated — ${error.message}`
            : "could not be evaluated",
      };
    }
  }

  /* ── Pattern conditions ──────────────────────────────────────────── */

  private pattern(
    condition: Extract<Condition, { kind: "pattern" }>,
    context: EvaluationContext,
    description: string,
  ): RuleOutcome {
    const timeframe = condition.timeframe ?? context.timeframe;
    const found = context.patterns[timeframe] ?? [];

    const match = found.find(
      (p) => p.pattern === condition.pattern && p.quality >= condition.minQuality,
    );

    if (!match) {
      /*
       * Was it not there at all, or was it there and not clean enough?
       *
       * Two very different pieces of information, and a trader debugging a silent
       * strategy needs to know which. "No bull flag" means look elsewhere; "a bull
       * flag at 0.61 quality, and you demanded 0.75" means the strategy is working
       * and the market is nearly there.
       */
      const nearMiss = found.find((p) => p.pattern === condition.pattern);

      return {
        description,
        outcome: "FAILED",
        evidence: nearMiss
          ? `${condition.pattern} was found on the ${timeframe}, but only ${nearMiss.quality.toFixed(2)} clean — the rule demands ${condition.minQuality.toFixed(2)}`
          : `no ${condition.pattern} on the ${timeframe}`,
      };
    }

    return {
      description,
      outcome: "PASSED",
      evidence: `${condition.pattern} on the ${timeframe}, ${match.quality.toFixed(2)} clean${
        match.evidence[0] ? ` — ${match.evidence[0]}` : ""
      }`,
    };
  }

  /* ── Comparison conditions ───────────────────────────────────────── */

  private comparison(
    condition: Extract<Condition, { kind: "comparison" }>,
    context: EvaluationContext,
    description: string,
  ): RuleOutcome {
    /*
     * Divergence is not an operator on two numbers — it is a comparison of the SHAPE
     * of two series across their swing points. The Divergence Engine (M04) owns it,
     * and the OperatorEvaluator deliberately THROWS if asked, so that a silent
     * `false` can never make every divergence condition on the platform quietly
     * never fire.
     */
    if (condition.op === "diverges_bullish" || condition.op === "diverges_bearish") {
      return this.evaluateDivergence(condition, context, description);
    }

    const left = this.series(condition.left, context);
    const right = this.series(condition.right, context);

    const upper =
      condition.rightUpper !== undefined
        ? this.series(condition.rightUpper, context)
        : undefined;

    if (!left || !right || (condition.rightUpper !== undefined && !upper)) {
      return {
        description,
        outcome: "UNAVAILABLE",
        evidence: "one of its indicators has not been computed",
      };
    }

    const index = left.length - 1;

    const bounds = upper ?? undefined;

    const passed = this.operators.evaluate({
      operator: condition.op,
      index,
      left,
      right,
      rightUpper: bounds,
    });

    return {
      description,
      outcome: passed ? "PASSED" : "FAILED",
      evidence: this.evidence(condition, left, right, bounds, index),
    };
  }

  private evaluateDivergence(
    condition: Extract<Condition, { kind: "comparison" }>,
    context: EvaluationContext,
    description: string,
  ): RuleOutcome {
    const indicator = this.series(condition.left, context);

    if (!indicator) {
      return {
        description,
        outcome: "UNAVAILABLE",
        evidence: "the indicator it diverges against has not been computed",
      };
    }

    const timeframe =
      condition.left.kind === "indicator"
        ? (condition.left.timeframe ?? context.timeframe)
        : context.timeframe;

    const candles = context.candles[timeframe];

    if (!candles) {
      return {
        description,
        outcome: "UNAVAILABLE",
        evidence: `no ${timeframe} candles`,
      };
    }

    // The right operand of a bar-count operator is the LOOKBACK, not a value.
    const lookback =
      condition.right.kind === "number" ? Math.floor(condition.right.value) : 0;

    const result =
      condition.op === "diverges_bullish"
        ? this.divergence.bullish(candles, indicator, lookback)
        : this.divergence.bearish(candles, indicator, lookback);

    if (!result.detected || !result.swings) {
      return {
        description,
        outcome: "FAILED",
        evidence: `no ${condition.op === "diverges_bullish" ? "bullish" : "bearish"} divergence in the last ${lookback} bars`,
      };
    }

    const [a, b] = result.swings;

    return {
      description,
      outcome: "PASSED",
      // The working, shown: the two swings the finding actually rests on.
      evidence: `price ${a.price > b.price ? "fell" : "rose"} from ${a.price} to ${b.price} while the indicator went ${a.indicatorValue.toFixed(1)} → ${b.indicatorValue.toFixed(1)} (strength ${result.strength.toFixed(2)}, quality ${result.quality.toFixed(2)})`,
    };
  }

  /* ── Operands ────────────────────────────────────────────────────── */

  /**
   * An operand, as a series aligned to the bars.
   *
   * A NUMBER becomes a flat series, which is not a trick — it is what makes the
   * operators uniform. `crosses_above` against a constant 30 is exactly the same
   * arithmetic as `crosses_above` against a moving average, and special-casing the
   * constant would mean two code paths for one idea.
   *
   * A BAR-COUNT operator's right operand is a lookback (`rising` for 3 bars), so it
   * is also a flat series carrying 3. Same shape, different meaning, and the operator
   * knows which.
   */
  private series(
    operand: Operand,
    context: EvaluationContext,
  ): readonly Maybe[] | null {
    const length = context.candles[context.timeframe]?.length ?? 0;

    if (operand.kind === "number") {
      return new Array<Maybe>(length).fill(operand.value);
    }

    const key = this.resolver.keyFor(operand, context.timeframe);
    if (!key) return null;

    const series = context.indicators[key];
    if (!series) return null;

    /*
     * The MULTIPLIER scales the result: "volume above average volume × 1.5".
     *
     * Applied here rather than baked into the indicator's identity, so the underlying
     * series is computed and cached ONCE however many rules scale it differently.
     */
    if (operand.multiplier !== undefined) {
      const factor = operand.multiplier;
      return series.map((v) => (v === null ? null : v * factor));
    }

    return series;
  }

  /* ── Evidence ────────────────────────────────────────────────────── */

  /**
   * The numbers behind the verdict.
   *
   * **The most valuable string this engine produces.** `PASSED` asks to be trusted;
   * *"RSI(14) was 27.4, the rule wanted below 30"* can be argued with — and the whole
   * product promise is that a trader can see why (PRODUCT_BIBLE).
   */
  private evidence(
    condition: Extract<Condition, { kind: "comparison" }>,
    left: readonly Maybe[],
    right: readonly Maybe[],
    upper: readonly Maybe[] | undefined,
    index: number,
  ): string {
    const l = left[index];
    const r = right[index];

    if (l === null || l === undefined) {
      return "the left-hand indicator has no value yet — not enough history";
    }

    const leftText = `${describeOperandShort(condition.left)} = ${format(l)}`;

    // The bar-count operators read the left series over N bars; the right operand is
    // that N, and printing "RSI = 27.4 vs 3" would be nonsense.
    if ((BAR_COUNT_OPERATORS as string[]).includes(condition.op)) {
      const bars = r ?? 0;
      const recent = left
        .slice(Math.max(0, index - Number(bars) + 1), index + 1)
        .map((v) => (v === null ? "—" : format(v)))
        .join(" → ");

      return `${describeOperandShort(condition.left)} over the last ${bars} bars: ${recent}`;
    }

    if ((RANGE_OPERATORS as string[]).includes(condition.op) && upper) {
      const u = upper[index];
      return `${leftText}, range ${format(r ?? 0)}–${format(u ?? 0)}`;
    }

    if (condition.op === "crosses_above" || condition.op === "crosses_below") {
      const lp = left[index - 1];
      const rp = right[index - 1];

      // A cross is an EVENT: it needs the previous bar to have been on the other side.
      // Showing only "now" would make a cross indistinguishable from a state.
      return `${describeOperandShort(condition.left)} ${format(lp)} → ${format(l)}, ${describeOperandShort(condition.right)} ${format(rp)} → ${format(r)}`;
    }

    return `${leftText}, ${describeOperandShort(condition.right)} = ${format(r)}`;
  }
}

function describeOperandShort(operand: Operand): string {
  if (operand.kind === "number") return String(operand.value);

  const period = operand.period !== undefined ? `(${operand.period})` : "";
  const timeframe = operand.timeframe ? ` ${operand.timeframe}` : "";
  const multiplier =
    operand.multiplier !== undefined ? ` × ${operand.multiplier}` : "";

  return `${operand.indicator}${period}${timeframe}${multiplier}`;
}

function format(value: Maybe | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);

  return value.toPrecision(4);
}

/** Both timeframes a condition can name. Used by the resolver's tests. */
export type ConditionTimeframe = Timeframe;
