import type {
  Condition,
  Indicator,
  Operand,
  Operator,
  Pattern,
  StrategyDefinition,
  Timeframe,
} from "@aegis/contracts";

/**
 * The six built-in strategies, as documents.
 *
 * These are seeds, not code (ADR-023). Each is an ordinary `StrategyDefinition`
 * — exactly the shape a user produces in the builder — so the backend evaluates
 * built-in and custom strategies with a single evaluator.
 *
 * Rewritten for ADR-024. The previous versions carried three conditions each and
 * were too thin to compete: no MACD, no divergence, and no way to say "the trend
 * structure is actually intact" or "this is a bull flag". They would have
 * underperformed, and a strategy that underperforms is a strategy that loses a
 * trader money.
 *
 * `record` is null on every one of them, because none has produced a settled
 * signal. That is the truth, and the UI says so: UNPROVEN — and an unproven
 * strategy can never take a Prime slot.
 */

/* ── little builders, so the rules below stay readable ─────────────── */

const num = (value: number): Operand => ({ kind: "number", value });

const ind = (
  indicator: Indicator,
  opts: {
    period?: number;
    timeframe?: Timeframe;
    multiplier?: number;
  } = {},
): Operand => ({ kind: "indicator", indicator, ...opts });

/** `left op right` */
const when = (
  left: Operand,
  op: Operator,
  right: Operand,
  rightUpper?: Operand,
): Condition => ({
  kind: "comparison",
  left,
  op,
  right,
  ...(rightUpper ? { rightUpper } : {}),
});

/** "a bull flag has formed, at least 75% clean" */
const pattern = (
  p: Pattern,
  minQuality = 0,
  timeframe?: Timeframe,
): Condition => ({
  kind: "pattern",
  pattern: p,
  minQuality,
  ...(timeframe ? { timeframe } : {}),
});

/* ── the strategies ────────────────────────────────────────────────── */

export const BUILT_IN_STRATEGIES: StrategyDefinition[] = [
  {
    id: "breakout",
    name: "Breakout",
    summary:
      "Price escapes a quiet range on heavy volume — the move that follows a squeeze.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "1h",
    entry: [
      when(ind("close"), "gt", ind("highest_high", { period: 20 })),
      when(
        ind("volume"),
        "gte",
        ind("volume_sma", { period: 20, multiplier: 1.5 }),
      ),
      // Momentum must be *turning*, not merely high. A histogram already rolling
      // over is a breakout that is about to fail.
      when(ind("macd_histogram"), "rising", num(2)),
      when(ind("rsi", { period: 14 }), "between", num(55), num(75)),
      // The trend has to actually be continuing, not just twitching.
      pattern("BREAK_OF_STRUCTURE"),
    ],
    filters: [
      when(ind("close"), "gt", ind("ema", { period: 200, timeframe: "4h" })),
      when(ind("adx", { period: 14, timeframe: "4h" }), "gte", num(18)),
      // Bollinger inside Keltner = the squeeze. Expansion follows compression.
      when(
        ind("bb_upper", { period: 20 }),
        "lt",
        ind("keltner_upper", { period: 20 }),
      ),
    ],
    stop: { kind: "atr", period: 14, multiplier: 1.2 },
    targets: [
      { rMultiple: 1.5, closePercent: 50 },
      { rMultiple: 3.0, closePercent: 50 },
    ],
    riskPercent: 1.0,
    maxLeverage: 3,
    riskLevel: "MODERATE",
    record: null,
  },

  {
    id: "trend-pullback",
    name: "Trend Pullback",
    summary:
      "Buy the dip inside a confirmed uptrend — join strength, don't chase it.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "LONG",
    market: "SPOT",
    timeframe: "4h",
    entry: [
      // The trend must be structurally intact — not merely above a moving
      // average, which lags and lies at exactly the wrong moment.
      pattern("HIGHER_HIGH_HIGHER_LOW"),
      when(ind("close"), "lte", ind("ema", { period: 21 })),
      // Momentum reset and turned back up — the dip is finished, not ongoing.
      when(ind("stoch_k", { period: 14 }), "crosses_above", ind("stoch_d", { period: 3 })),
      when(ind("rsi", { period: 14 }), "crosses_above", num(50)),
    ],
    filters: [
      when(
        ind("ema", { period: 21, timeframe: "1d" }),
        "gt",
        ind("ema", { period: 200, timeframe: "1d" }),
      ),
      when(
        ind("close", { timeframe: "1d" }),
        "gt",
        ind("ema", { period: 200, timeframe: "1d" }),
      ),
      // A bull flag is what a healthy pullback looks like on the chart.
      pattern("BULL_FLAG", 0.6),
    ],
    stop: { kind: "structure", lookback: 20 },
    targets: [
      { rMultiple: 2.0, closePercent: 50 },
      { rMultiple: 4.0, closePercent: 50 },
    ],
    riskPercent: 1.5,
    maxLeverage: null,
    riskLevel: "LOW",
    record: null,
  },

  {
    id: "reversal",
    name: "Reversal",
    summary:
      "Fade a move that went too far, too fast — snap back toward the average.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "1h",
    entry: [
      when(ind("close"), "lt", ind("bb_lower", { period: 20 })),
      when(ind("zscore", { period: 20 }), "lte", num(-2.2)),
      // THE ONE THAT MATTERS. Price makes a lower low; RSI makes a higher low.
      // The selling is exhausted even though the price says otherwise. This
      // could not be expressed at all before ADR-024.
      when(ind("rsi", { period: 14 }), "diverges_bullish", num(20)),
      // The stops below were taken and reclaimed — the move was engineered.
      pattern("LIQUIDITY_SWEEP"),
    ],
    filters: [
      // Only fade inside a range. Fading a trend is how accounts die.
      when(ind("adx", { period: 14, timeframe: "4h" }), "lt", num(20)),
      when(
        ind("volume"),
        "gte",
        ind("volume_sma", { period: 20, multiplier: 2.0 }),
      ),
    ],
    stop: { kind: "atr", period: 14, multiplier: 1.0 },
    targets: [
      { rMultiple: 1.2, closePercent: 60 },
      { rMultiple: 2.0, closePercent: 40 },
    ],
    riskPercent: 0.75,
    maxLeverage: 2,
    riskLevel: "ELEVATED",
    record: null,
  },

  {
    id: "level-bounce",
    name: "Level Bounce",
    summary:
      "Price rejects a level that has held before — trade the bounce off proven support or resistance.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "15m",
    entry: [
      // The level is an order block: the candle that caused the last move, where
      // large orders were left unfilled.
      pattern("ORDER_BLOCK"),
      when(ind("close"), "gt", ind("lowest_low", { period: 50 })),
      when(
        ind("volume"),
        "gte",
        ind("volume_sma", { period: 20, multiplier: 1.3 }),
      ),
      // Buyers absorbed the selling at the level — CVD rising while price is
      // flat is the footprint of accumulation.
      when(ind("cvd"), "rising", num(3)),
    ],
    filters: [
      when(
        ind("ema", { period: 50, timeframe: "1h" }),
        "lt",
        ind("close", { timeframe: "1h" }),
      ),
    ],
    stop: { kind: "atr", period: 14, multiplier: 0.5 },
    targets: [
      { rMultiple: 1.0, closePercent: 50 },
      { rMultiple: 2.0, closePercent: 50 },
    ],
    riskPercent: 0.5,
    maxLeverage: 5,
    riskLevel: "MODERATE",
    record: null,
  },

  {
    id: "pattern-break",
    name: "Pattern Break",
    summary:
      "A clean chart pattern completes and price breaks out of it — flags, wedges and triangles, traded on the break.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "4h",
    entry: [
      // High bar on quality: a half-formed wedge is a Rorschach test, not a
      // trade. 75% clean or it does not count.
      pattern("FALLING_WEDGE", 0.75),
      when(ind("close"), "gt", ind("highest_high", { period: 10 })),
      when(
        ind("volume"),
        "gte",
        ind("volume_sma", { period: 20, multiplier: 1.4 }),
      ),
      when(ind("macd_line"), "crosses_above", ind("macd_signal")),
    ],
    filters: [
      when(ind("adx", { period: 14, timeframe: "1d" }), "gte", num(20)),
    ],
    stop: { kind: "structure", lookback: 10 },
    targets: [
      { rMultiple: 2.0, closePercent: 50 },
      { rMultiple: 4.0, closePercent: 50 },
    ],
    riskPercent: 1.0,
    maxLeverage: 3,
    riskLevel: "MODERATE",
    record: null,
  },

  {
    id: "crowd-squeeze",
    name: "Crowd Squeeze",
    summary:
      "Everyone is on one side, paying to stay there, and price has stopped rewarding them. Trade against the crowd.",
    origin: "BUILT_IN",
    // Ships OFF: it needs funding, open interest and long/short ratio — a
    // derivatives feed the platform does not have. Switching it on would be
    // pretending to measure something we cannot see.
    enabled: false,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "4h",
    entry: [
      when(ind("funding_rate"), "gte", num(0.08)),
      when(ind("open_interest"), "rising", num(5)),
      when(ind("long_short_ratio"), "gte", num(1.8)),
      // Price has stopped rewarding the crowd — the first crack.
      pattern("CHANGE_OF_CHARACTER"),
      when(ind("close"), "crosses_below", ind("ema", { period: 21 })),
    ],
    filters: [],
    stop: { kind: "structure", lookback: 12 },
    targets: [
      { rMultiple: 1.5, closePercent: 40 },
      { rMultiple: 3.0, closePercent: 60 },
    ],
    riskPercent: 1.0,
    maxLeverage: 2,
    riskLevel: "HIGH",
    record: null,
  },
];

export function strategyById(id: string): StrategyDefinition | undefined {
  return BUILT_IN_STRATEGIES.find((s) => s.id === id);
}

export function strategyByName(name: string): StrategyDefinition | undefined {
  return BUILT_IN_STRATEGIES.find((s) => s.name === name);
}

/** Names only — used by mocks, filters and the scanner. */
export const STRATEGY_NAMES: string[] = BUILT_IN_STRATEGIES.map((s) => s.name);

/** Spot-only strategies never emit SHORT or leveraged signals. */
export const SPOT_ONLY_STRATEGY_NAMES: string[] = BUILT_IN_STRATEGIES.filter(
  (s) => s.market === "SPOT",
).map((s) => s.name);
