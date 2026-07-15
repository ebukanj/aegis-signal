import type {
  AnyOf,
  Condition,
  Indicator,
  Operand,
  Operator,
  Pattern,
  Rule,
  StrategyDefinition,
} from "./strategy";
import { rulesHash } from "./strategy";
import type { Timeframe } from "./domain";

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
    shift?: number;
  } = {},
): Operand => ({ kind: "indicator", indicator, ...opts });

/**
 * `left op right`, as an entry RULE.
 *
 * The builders return rules rather than bare conditions, so the six documents below
 * needed no edits when the entry language gained ANY-OF groups. A rule is a
 * condition that knows whether it is negated.
 */
const comparison = (
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

const when = (
  left: Operand,
  op: Operator,
  right: Operand,
  rightUpper?: Operand,
): Rule => ({
  kind: "rule",
  condition: comparison(left, op, right, rightUpper),
  negate: false,
});

/** "…is NOT true". */
const not = (rule: Rule): Rule => ({ ...rule, negate: true });

/**
 * "ANY of these will do."
 *
 * One level of OR, and one level only — see `entryRuleSchema`. This is what Pattern
 * Break needs: a bull flag OR a falling wedge OR an ascending triangle. A trader says
 * that in one breath, and the strategy editor can render it as a group of checkboxes.
 */
const either = (...rules: Rule[]): AnyOf => ({ kind: "any_of", rules });

/** "a bull flag has formed, at least 75% clean" */
const pattern = (
  p: Pattern,
  minQuality = 0,
  timeframe?: Timeframe,
): Rule => ({
  kind: "rule",
  condition: {
    kind: "pattern",
    pattern: p,
    minQuality,
    ...(timeframe ? { timeframe } : {}),
  },
  negate: false,
});

/* ── the strategies ────────────────────────────────────────────────── */

const SEEDS: Omit<StrategyDefinition, "version" | "rulesHash">[] = [
  {
    id: "breakout",
    /*
     * A breakout needs a market that can RUN. In a range, every breakout is a
     * false one by construction — that is what a range IS: a place where breaks
     * fail. This strategy in a range is not merely unprofitable, it is a machine
     * for buying the top of every fake move.
     */
    regimes: ["TRENDING_BULL", "TRENDING_BEAR", "HIGH_VOLATILITY"],
    avoidRegimes: ["RANGE", "RISK_OFF"],
    name: "Breakout",
    summary:
      "Price escapes a quiet range on heavy volume — the move that follows a squeeze.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "1h",
    entry: [
      // Break above the PRIOR 20-bar high (shift: 1) — a Donchian breakout. Without
      // the shift this compares the close against a window that includes the bar's
      // own high, which is never exceeded, and the strategy could never fire.
      when(ind("close"), "gt", ind("highest_high", { period: 20, shift: 1 })),
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
    /*
     * The clue is in the name: it needs a trend to pull back INTO. In a range a
     * "pullback" is just the other side of the range, and buying it is buying a
     * ceiling.
     */
    regimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    avoidRegimes: ["RANGE", "TRANSITION", "RISK_OFF"],
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
    /*
     * Reversal is the mirror image of Breakout, and its avoid-list is the reason
     * both exist. Fading a STRONG TREND is how accounts die: the strategy sells
     * every new high, all the way up, and each loss looks like bad luck rather than
     * a category error. It belongs in ranges and at exhaustion, never in a trend.
     */
    regimes: ["RANGE", "HIGH_VOLATILITY", "TRANSITION"],
    avoidRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
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
      // First target raised 1.2 → 1.5R: the Risk Engine refuses anything below its
      // 1.5R floor, so at 1.2 every candidate this strategy produced was vetoed
      // before it could reach a trader.
      { rMultiple: 1.5, closePercent: 60 },
      { rMultiple: 2.5, closePercent: 40 },
    ],
    riskPercent: 0.75,
    maxLeverage: 2,
    riskLevel: "ELEVATED",
    record: null,
  },

  {
    id: "level-bounce",
    /*
     * Levels hold in a range and get obliterated in a trend. A trending market
     * eats support like it is not there — which is precisely what "trending" means.
     */
    regimes: ["RANGE"],
    avoidRegimes: ["TRENDING_BULL", "TRENDING_BEAR", "HIGH_VOLATILITY", "RISK_OFF"],
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

      /*
       * AND THE STRUCTURE MUST NOT BE BREAKING.
       *
       * A level bounce buys a floor. A change of character says the floor is giving
       * way — price has taken out a swing AGAINST the trend for the first time. Buying
       * a level while structure is breaking is not a bounce, it is catching a knife,
       * and it is the single most expensive way to trade support.
       *
       * The entry language had no way to say "NOT" until now.
       */
      not(pattern("CHANGE_OF_CHARACTER")),
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
      // First target raised 1.0 → 1.5R to clear the Risk Engine's 1.5R floor —
      // at 1.0R every Level Bounce candidate was vetoed on RISK_REWARD and never
      // reached a trader. A tight 0.5-ATR stop makes 1.5R a modest, reachable move.
      { rMultiple: 1.5, closePercent: 50 },
      { rMultiple: 3.0, closePercent: 50 },
    ],
    riskPercent: 0.5,
    maxLeverage: 5,
    riskLevel: "MODERATE",
    record: null,
  },

  {
    id: "pattern-break",
    /*
     * Chart patterns need room to form and a market willing to follow through.
     * They form in anything; they only RESOLVE when there is participation.
     */
    regimes: ["TRENDING_BULL", "TRENDING_BEAR", "TRANSITION"],
    avoidRegimes: ["RISK_OFF"],
    name: "Pattern Break",
    summary:
      "A clean chart pattern completes and price breaks out of it — flags, wedges and triangles, traded on the break.",
    origin: "BUILT_IN",
    enabled: true,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "4h",
    entry: [
      /*
       * THE OR THIS STRATEGY ALWAYS NEEDED.
       *
       * Its summary promises "flags, wedges and triangles" and its rules demanded a
       * falling wedge and nothing else — because the entry language had no way to say
       * "any of these". It does now, and this is what a single level of OR is for.
       *
       * High bar on quality: a half-formed wedge is a Rorschach test, not a trade.
       * 75% clean or it does not count.
       */
      either(
        pattern("FALLING_WEDGE", 0.75),
        pattern("BULL_FLAG", 0.75),
        pattern("ASCENDING_TRIANGLE", 0.75),
      ),
      // The PRIOR 10-bar high (shift: 1). See Breakout — an unshifted highest_high
      // includes the current bar and can never be exceeded by that bar's close.
      when(ind("close"), "gt", ind("highest_high", { period: 10, shift: 1 })),
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
    /*
     * A squeeze needs crowding, and crowding happens at extremes. Already DISABLED
     * for want of a derivatives feed; the regime declaration is here so it works
     * the day that feed lands, rather than being remembered then.
     */
    regimes: ["HIGH_VOLATILITY", "TRENDING_BULL", "TRENDING_BEAR"],
    avoidRegimes: ["RANGE"],
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

/**
 * The six built-in strategies, each stamped with the fingerprint of its own rules.
 *
 * The hash is computed here rather than written by hand, so it can never drift from
 * what the document actually says. That matters more than it sounds: the hash is what
 * decides whether an edited strategy keeps its track record, and a stale one would
 * quietly let a rewritten strategy inherit confidence it never earned.
 */
export const BUILT_IN_STRATEGIES: StrategyDefinition[] = SEEDS.map((strategy) => ({
  ...strategy,
  version: 1,
  rulesHash: rulesHash(strategy),
}));

export function strategyById(id: string): StrategyDefinition | undefined {
  return BUILT_IN_STRATEGIES.find((s) => s.id === id);
}
