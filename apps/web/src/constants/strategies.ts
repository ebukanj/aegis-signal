import type { StrategyDefinition } from "@aegis/contracts";

/**
 * The five built-in strategies, as documents.
 *
 * These are seeds, not code (ADR-023). Each one is an ordinary
 * `StrategyDefinition` — exactly the same shape a user produces in the
 * strategy builder — so the backend evaluates all of them, built-in and
 * custom alike, with a single evaluator.
 *
 * Names are plain trader English. The old codenames (Ignition, Tidewater,
 * Rubber Band, Sniper, Crowded Boat, Killzone, Flush) told a trader nothing
 * about what the rule actually looks for.
 *
 * `record` is null on every one of them because none has produced a settled
 * signal yet. That is the truth, and the UI says so: UNPROVEN.
 */

const num = (value: number) => ({ kind: "number" as const, value });

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
      {
        left: { kind: "indicator", indicator: "close" },
        op: "gt",
        right: { kind: "indicator", indicator: "highest_high", period: 20 },
      },
      {
        left: { kind: "indicator", indicator: "volume" },
        op: "gte",
        right: {
          kind: "indicator",
          indicator: "volume_sma",
          period: 20,
          multiplier: 1.5,
        },
      },
      {
        left: { kind: "indicator", indicator: "rsi", period: 14 },
        op: "between",
        right: num(55),
        rightUpper: num(75),
      },
    ],
    filters: [
      {
        left: { kind: "indicator", indicator: "close" },
        op: "gt",
        right: {
          kind: "indicator",
          indicator: "ema",
          period: 200,
          timeframe: "4h",
        },
      },
      {
        left: { kind: "indicator", indicator: "adx", period: 14, timeframe: "4h" },
        op: "gte",
        right: num(18),
      },
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
      {
        left: { kind: "indicator", indicator: "close" },
        op: "lte",
        right: { kind: "indicator", indicator: "ema", period: 21 },
      },
      {
        left: { kind: "indicator", indicator: "rsi", period: 14 },
        op: "crosses_above",
        right: num(50),
      },
    ],
    filters: [
      {
        left: { kind: "indicator", indicator: "ema", period: 21, timeframe: "1d" },
        op: "gt",
        right: { kind: "indicator", indicator: "ema", period: 200, timeframe: "1d" },
      },
      {
        left: { kind: "indicator", indicator: "close", timeframe: "1d" },
        op: "gt",
        right: { kind: "indicator", indicator: "ema", period: 200, timeframe: "1d" },
      },
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
      {
        left: { kind: "indicator", indicator: "close" },
        op: "lt",
        right: { kind: "indicator", indicator: "bb_lower", period: 20 },
      },
      {
        left: { kind: "indicator", indicator: "zscore", period: 20 },
        op: "lte",
        right: num(-2.2),
      },
      {
        left: { kind: "indicator", indicator: "rsi", period: 14 },
        op: "crosses_above",
        right: num(30),
      },
    ],
    filters: [
      {
        left: { kind: "indicator", indicator: "adx", period: 14, timeframe: "4h" },
        op: "lt",
        right: num(20),
      },
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
      {
        left: { kind: "indicator", indicator: "low" },
        op: "lte",
        right: { kind: "indicator", indicator: "lowest_low", period: 50 },
      },
      {
        left: { kind: "indicator", indicator: "close" },
        op: "gt",
        right: { kind: "indicator", indicator: "lowest_low", period: 50 },
      },
      {
        left: { kind: "indicator", indicator: "volume" },
        op: "gte",
        right: {
          kind: "indicator",
          indicator: "volume_sma",
          period: 20,
          multiplier: 1.3,
        },
      },
    ],
    filters: [
      {
        left: { kind: "indicator", indicator: "ema", period: 50, timeframe: "1h" },
        op: "lt",
        right: { kind: "indicator", indicator: "close", timeframe: "1h" },
      },
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
    id: "crowd-squeeze",
    name: "Crowd Squeeze",
    summary:
      "Everyone is on one side, paying to stay there, and price has stopped rewarding them. Trade against the crowd.",
    origin: "BUILT_IN",
    enabled: false,
    direction: "BOTH",
    market: "PERPETUAL",
    timeframe: "4h",
    entry: [
      {
        left: { kind: "indicator", indicator: "funding_rate" },
        op: "gte",
        right: num(0.08),
      },
      {
        left: { kind: "indicator", indicator: "open_interest" },
        op: "gte",
        right: {
          kind: "indicator",
          indicator: "open_interest",
          period: 30,
          multiplier: 1.0,
        },
      },
      {
        left: { kind: "indicator", indicator: "close" },
        op: "crosses_below",
        right: { kind: "indicator", indicator: "ema", period: 21 },
      },
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
