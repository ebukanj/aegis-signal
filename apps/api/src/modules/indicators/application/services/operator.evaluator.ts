import { Injectable } from "@nestjs/common";
import type { Operator } from "@aegis/contracts";
import type { Maybe } from "../math/rolling";

/**
 * Where a number becomes a yes or a no.
 *
 * The Strategy Engine owns *which* conditions a strategy has and *how* they
 * combine. This owns only the question "given these values, is this one condition
 * true at this bar?" — pure arithmetic, no knowledge that a strategy exists.
 *
 * ── The null rule, and it is absolute ──
 *
 * **A condition on an unknown value is FALSE, never true.**
 *
 * If the EMA(200) has not warmed up, "price is above the 200 EMA" is not true. It
 * is not false-but-nearly. It is unanswerable, and the only safe reading of an
 * unanswerable entry condition is "do not take this trade". Every operator below
 * returns `false` on null, and none of them silently coerce a null to 0 — which
 * would turn "price above the 200 EMA" into "price above zero", a condition that
 * is always true and would fire on every asset on earth.
 */
@Injectable()
export class OperatorEvaluator {
  /**
   * Evaluate one condition at one bar.
   *
   * @param index      the bar to evaluate AT — normally the last closed one
   * @param left       the left operand's full series
   * @param right      the right operand's full series (a constant is a flat series)
   * @param rightUpper the upper bound, for the range operators
   */
  evaluate(input: {
    operator: Operator;
    index: number;
    left: readonly Maybe[];
    right: readonly Maybe[];
    rightUpper?: readonly Maybe[];
  }): boolean {
    const { operator, index, left, right, rightUpper } = input;

    if (index < 0 || index >= left.length) return false;

    const a = left[index];
    const b = right[index];

    switch (operator) {
      case "gt":
        return a !== null && b !== null && a > b;
      case "gte":
        return a !== null && b !== null && a >= b;
      case "lt":
        return a !== null && b !== null && a < b;
      case "lte":
        return a !== null && b !== null && a <= b;

      /*
       * Equality, WITH A TOLERANCE — and never `===`.
       *
       * These are float64s produced by long chains of arithmetic. An EMA is never
       * exactly 50, and `ema === 50` is false essentially always, so a strategy
       * built on it would never fire and nothing would explain why. The tolerance
       * is relative, because "close enough" means something different at BTC's
       * 62,000 than at SHIB's 0.0000082.
       */
      case "eq":
        return a !== null && b !== null && approximatelyEqual(a, b);
      case "neq":
        return a !== null && b !== null && !approximatelyEqual(a, b);

      case "crosses_above":
        return this.crosses(left, right, index, "above");
      case "crosses_below":
        return this.crosses(left, right, index, "below");

      case "between": {
        const upper = rightUpper?.[index];
        if (a === null || b === null || upper === null || upper === undefined) {
          return false;
        }
        return a >= Math.min(b, upper) && a <= Math.max(b, upper);
      }

      case "outside_range": {
        const upper = rightUpper?.[index];
        if (a === null || b === null || upper === null || upper === undefined) {
          return false;
        }
        // NOT `!between`. An unknown value is outside nothing — it is unknown, and
        // an unknown must never satisfy a condition.
        return a < Math.min(b, upper) || a > Math.max(b, upper);
      }

      /*
       * The bar-count operators. The right operand is N — a lookback, not a value.
       */
      case "rising":
        return this.monotonic(left, index, barsFrom(b), "up");
      case "falling":
        return this.monotonic(left, index, barsFrom(b), "down");

      case "above_average":
        return this.againstOwnAverage(left, index, barsFrom(b), "above");
      case "below_average":
        return this.againstOwnAverage(left, index, barsFrom(b), "below");

      /*
       * Divergence is not arithmetic on two numbers — it is a comparison of the
       * SHAPE of two series across their swing points. It belongs to the Divergence
       * Engine, and the Strategy Engine calls that directly.
       */
      case "diverges_bullish":
      case "diverges_bearish":
        throw new Error(
          `"${operator}" is not evaluated here — divergence needs swing detection across two ` +
            `series and is the Divergence Engine's job. Calling it through the operator ` +
            `evaluator would silently return false and the condition would never fire.`,
        );
    }
  }

  /**
   * A crossing needs TWO bars, and the previous one must be on the other side.
   *
   * `a > b` today is not a cross — it may have been true for a month. A cross is
   * an EVENT: it was not true at the previous bar and it is true now. Getting this
   * wrong turns "MACD crosses above signal" (which fires once, at the turn) into
   * "MACD is above signal" (which fires on every bar of the trend that follows),
   * and a strategy would produce a signal every single bar until the trend ended.
   *
   * Strict `>` and `<` on both sides, so a series that merely touches its
   * counterpart and pulls back has not crossed it.
   */
  private crosses(
    left: readonly Maybe[],
    right: readonly Maybe[],
    index: number,
    direction: "above" | "below",
  ): boolean {
    if (index < 1) return false;

    const nowLeft = left[index];
    const nowRight = right[index];
    const wasLeft = left[index - 1];
    const wasRight = right[index - 1];

    if (nowLeft === null || nowRight === null || wasLeft === null || wasRight === null) {
      return false;
    }

    return direction === "above"
      ? wasLeft <= wasRight && nowLeft > nowRight
      : wasLeft >= wasRight && nowLeft < nowRight;
  }

  /**
   * Rising / falling — STRICTLY monotonic over the last N bars.
   *
   * "MACD histogram rising for 3 bars" means each of the last 3 bars was higher
   * than the one before it. A flat bar breaks the run, deliberately: momentum that
   * has stalled is not momentum that is building, and allowing "greater than or
   * equal" would let a completely flat series report as rising forever.
   */
  private monotonic(
    values: readonly Maybe[],
    index: number,
    bars: number,
    direction: "up" | "down",
  ): boolean {
    if (bars < 1 || index < bars) return false;

    for (let i = index - bars + 1; i <= index; i++) {
      const current = values[i];
      const previous = values[i - 1];

      if (current === null || previous === null) return false;

      if (direction === "up" && current <= previous) return false;
      if (direction === "down" && current >= previous) return false;
    }

    return true;
  }

  /**
   * Against the indicator's OWN mean over N bars.
   *
   * "RSI above its own average" adapts to the instrument; "RSI above 50" is a
   * number someone picked in 1978. This is the operator that lets a strategy be
   * written once and mean the same thing on BTC and on a low-cap alt.
   *
   * The window EXCLUDES the current bar — comparing a value against an average
   * that includes itself drags the average toward it and makes the comparison
   * partly self-referential. With N=20, a large spike would lift its own benchmark
   * by 5% of its own size.
   */
  private againstOwnAverage(
    values: readonly Maybe[],
    index: number,
    bars: number,
    direction: "above" | "below",
  ): boolean {
    if (bars < 1 || index < bars) return false;

    const current = values[index];
    if (current === null) return false;

    let sum = 0;
    for (let i = index - bars; i < index; i++) {
      const value = values[i];
      if (value === null) return false; // an average with a hole in it is not an average
      sum += value;
    }

    const average = sum / bars;

    return direction === "above" ? current > average : current < average;
  }
}

/**
 * Relative equality.
 *
 * An absolute epsilon cannot work across a universe that holds BTC at 62,000 and
 * SHIB at 0.0000082: any epsilon loose enough to be meaningful for SHIB makes
 * every BTC price equal to every other.
 */
function approximatelyEqual(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * 1e-9;
}

/** The bar-count operators encode N in the right operand, as a flat series. */
function barsFrom(value: Maybe): number {
  return value === null ? 0 : Math.floor(value);
}
