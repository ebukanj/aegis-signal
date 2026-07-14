import { BAR_COUNT_OPERATORS, RANGE_OPERATORS } from "./strategy";
import type {
  Condition,
  Indicator,
  Operand,
  Operator,
  Pattern,
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
 * It is the reason a strategy document is *self-explanatory*: the thing the user
 * edits and the thing the user reads are the same object.
 */

const INDICATOR_WORDS: Record<Indicator, string> = {
  // price
  open: "the open",
  high: "the high",
  low: "the low",
  close: "price",

  // volume
  volume: "volume",
  volume_sma: "average volume",
  obv: "on-balance volume",
  cvd: "cumulative volume delta",
  vwap: "VWAP",

  // moving averages
  sma: "the simple moving average",
  ema: "the EMA",

  // momentum
  rsi: "RSI",
  macd_line: "the MACD line",
  macd_signal: "the MACD signal line",
  macd_histogram: "the MACD histogram",
  stoch_k: "Stochastic %K",
  stoch_d: "Stochastic %D",
  kdj_k: "KDJ K",
  kdj_d: "KDJ D",
  kdj_j: "KDJ J",
  cci: "CCI",
  williams_r: "Williams %R",
  roc: "rate of change",
  mfi: "money flow index",

  // trend
  adx: "ADX (trend strength)",
  plus_di: "+DI",
  minus_di: "−DI",
  supertrend: "Supertrend",
  psar: "Parabolic SAR",
  ichimoku_tenkan: "the Ichimoku conversion line",
  ichimoku_kijun: "the Ichimoku base line",
  ichimoku_span_a: "the Ichimoku cloud top",
  ichimoku_span_b: "the Ichimoku cloud bottom",

  // volatility
  atr: "ATR",
  bb_upper: "the upper Bollinger Band",
  bb_middle: "the Bollinger midline",
  bb_lower: "the lower Bollinger Band",
  bb_width: "Bollinger Band width",
  keltner_upper: "the upper Keltner channel",
  keltner_lower: "the lower Keltner channel",
  donchian_upper: "the Donchian high",
  donchian_lower: "the Donchian low",

  // structure
  highest_high: "the highest high",
  lowest_low: "the lowest low",

  // derivatives
  funding_rate: "the funding rate",
  open_interest: "open interest",
  long_short_ratio: "the long/short ratio",

  // statistics
  zscore: "the Z-score",
};

const OPERATOR_WORDS: Record<Operator, string> = {
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
  eq: "is exactly",
  neq: "is not",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
  between: "is between",
  outside_range: "is outside",
  above_average: "is above its own average over",
  below_average: "is below its own average over",
  rising: "has been rising for",
  falling: "has been falling for",
  diverges_bullish: "shows bullish divergence over",
  diverges_bearish: "shows bearish divergence over",
};

/**
 * Patterns, in the words a trader would actually use — and, crucially, what each
 * one *means*. A name alone teaches nobody: "change of character" is jargon
 * until someone tells you it is the first sign a trend is breaking.
 */
export const PATTERN_WORDS: Record<
  Pattern,
  { label: string; meaning: string }
> = {
  HIGHER_HIGH_HIGHER_LOW: {
    label: "uptrend structure",
    meaning:
      "Each swing high is higher than the last, and so is each swing low. This is what an intact uptrend actually looks like.",
  },
  LOWER_HIGH_LOWER_LOW: {
    label: "downtrend structure",
    meaning:
      "Each swing high is lower than the last, and so is each swing low. An intact downtrend.",
  },
  BREAK_OF_STRUCTURE: {
    label: "a break of structure",
    meaning:
      "Price took out the previous swing point in the direction of the trend — the trend is continuing, not turning.",
  },
  CHANGE_OF_CHARACTER: {
    label: "a change of character",
    meaning:
      "Price broke a swing point AGAINST the trend for the first time. This is the earliest evidence a trend is ending — and the most valuable.",
  },
  LIQUIDITY_SWEEP: {
    label: "a liquidity sweep",
    meaning:
      "Price dipped below an obvious low (taking everyone's stops) and then reclaimed it. The move was engineered to harvest stops, not to go lower.",
  },
  FAIR_VALUE_GAP: {
    label: "a fair value gap",
    meaning:
      "Price moved so fast it left an imbalance behind. Price tends to come back and fill it.",
  },
  ORDER_BLOCK: {
    label: "an order block",
    meaning:
      "The candle that caused the last big move. Large orders were left unfilled there, so price often reacts when it returns.",
  },
  RANGE: {
    label: "a range",
    meaning:
      "A clear floor and a clear ceiling, with price going nowhere between them.",
  },
  DOUBLE_TOP: {
    label: "a double top",
    meaning:
      "Price tested the same high twice and failed. Buyers could not get through.",
  },
  DOUBLE_BOTTOM: {
    label: "a double bottom",
    meaning:
      "Price tested the same low twice and held. Sellers could not get through.",
  },
  BULL_FLAG: {
    label: "a bull flag",
    meaning:
      "A sharp rise, then a calm drift sideways or slightly down. The pause before the next leg up.",
  },
  BEAR_FLAG: {
    label: "a bear flag",
    meaning:
      "A sharp fall, then a calm drift sideways or slightly up. The pause before the next leg down.",
  },
  PENNANT: {
    label: "a pennant",
    meaning:
      "A sharp move, then a tightening coil. Volatility compressing before it expands again.",
  },
  FALLING_WEDGE: {
    label: "a falling wedge",
    meaning:
      "Price is drifting down, but the drift is narrowing — sellers are running out of strength. Usually breaks upward.",
  },
  RISING_WEDGE: {
    label: "a rising wedge",
    meaning:
      "Price is grinding up, but the grind is narrowing — buyers are running out of strength. Usually breaks downward.",
  },
  ASCENDING_TRIANGLE: {
    label: "an ascending triangle",
    meaning:
      "A flat ceiling with rising lows. Buyers keep paying more while the ceiling holds — usually it eventually gives.",
  },
  DESCENDING_TRIANGLE: {
    label: "a descending triangle",
    meaning:
      "A flat floor with falling highs. Sellers keep accepting less while the floor holds — usually it eventually gives.",
  },
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
  if (condition.kind === "pattern") {
    const { label } = PATTERN_WORDS[condition.pattern];
    const where = condition.timeframe ? ` on the ${condition.timeframe}` : "";
    const quality =
      condition.minQuality > 0
        ? ` (at least ${Math.round(condition.minQuality * 100)}% clean)`
        : "";
    return `${label} has formed${where}${quality}`;
  }

  const left = describeOperand(condition.left);
  const op = OPERATOR_WORDS[condition.op];
  const right = describeOperand(condition.right);

  // "MACD histogram has been rising for 3 bars"
  if ((BAR_COUNT_OPERATORS as string[]).includes(condition.op)) {
    const bars = condition.right.kind === "number" ? condition.right.value : 0;
    return `${left} ${op} ${bars} ${bars === 1 ? "bar" : "bars"}`;
  }

  // "price is between 40 and 60" / "RSI is outside 30 and 70"
  if ((RANGE_OPERATORS as string[]).includes(condition.op) && condition.rightUpper) {
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
