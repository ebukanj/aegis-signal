import type {
  Condition,
  Indicator,
  Operand,
  Operator,
  StopRule,
  StrategyDefinition,
  TargetRule,
} from "./strategy";

/**
 * Turns a strategy document into sentences a trader can read.
 *
 * This lives in the contract, not the frontend, because the same words must
 * appear on the Strategies page, inside a signal's "why", and in the Telegram
 * alert. One renderer, one vocabulary, no drift (AGENTS.md §2).
 *
 * It is the reason a strategy document is *self-explanatory*: the thing the
 * user edits and the thing the user reads are the same object.
 */

const INDICATOR_WORDS: Record<Indicator, string> = {
  open: "the open",
  high: "the high",
  low: "the low",
  close: "price",
  volume: "volume",
  volume_sma: "average volume",
  sma: "the simple moving average",
  ema: "the EMA",
  rsi: "RSI",
  adx: "ADX",
  atr: "ATR",
  bb_upper: "the upper Bollinger Band",
  bb_middle: "the Bollinger midline",
  bb_lower: "the lower Bollinger Band",
  bb_width: "Bollinger Band width",
  highest_high: "the highest high",
  lowest_low: "the lowest low",
  vwap: "VWAP",
  funding_rate: "the funding rate",
  open_interest: "open interest",
  zscore: "the Z-score",
};

const OPERATOR_WORDS: Record<Operator, string> = {
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
  between: "is between",
};

export function describeOperand(operand: Operand): string {
  if (operand.kind === "number") return String(operand.value);

  let text = INDICATOR_WORDS[operand.indicator];
  if (operand.period !== undefined) text += ` (${operand.period})`;
  if (operand.multiplier !== undefined) text = `${operand.multiplier}× ${text}`;
  if (operand.timeframe !== undefined) text += ` on the ${operand.timeframe}`;
  return text;
}

export function describeCondition(condition: Condition): string {
  const left = describeOperand(condition.left);
  const op = OPERATOR_WORDS[condition.op];
  const right = describeOperand(condition.right);

  if (condition.op === "between" && condition.rightUpper) {
    return `${left} ${op} ${right} and ${describeOperand(condition.rightUpper)}`;
  }
  return `${left} ${op} ${right}`;
}

export function describeStop(stop: StopRule): string {
  switch (stop.kind) {
    case "atr":
      return `${stop.multiplier}× ATR (${stop.period}) away from entry`;
    case "percent":
      return `${stop.value}% away from entry`;
    case "structure":
      return `beyond the last ${stop.lookback} bars' extreme`;
  }
}

export function describeTarget(target: TargetRule): string {
  return `+${target.rMultiple}R — close ${target.closePercent}%`;
}

/** The whole strategy, as prose. Used verbatim on the Strategies page. */
export function describeStrategy(strategy: StrategyDefinition): {
  headline: string;
  entry: string[];
  filters: string[];
  stop: string;
  targets: string[];
  risk: string;
} {
  const side =
    strategy.direction === "BOTH" ? "LONG or SHORT" : strategy.direction;

  return {
    headline: `Enter ${side} on the ${strategy.timeframe} when ALL of the following are true:`,
    entry: strategy.entry.map(describeCondition),
    filters: strategy.filters.map(describeCondition),
    stop: describeStop(strategy.stop),
    targets: strategy.targets.map(describeTarget),
    risk:
      strategy.maxLeverage === null
        ? `Risk ${strategy.riskPercent}% of equity per trade. Spot — no leverage.`
        : `Risk ${strategy.riskPercent}% of equity per trade. Up to ${strategy.maxLeverage}× leverage.`,
  };
}
