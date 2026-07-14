import { z } from "zod";
import {
  marketRegimeSchema,
  marketTypeSchema,
  riskLevelSchema,
  signalDirectionSchema,
  timeframeSchema,
} from "./domain";

/**
 * A strategy is a DOCUMENT, not code.
 *
 * This is the load-bearing decision of the whole platform (ADR-023). Every
 * strategy — the built-in ones and every strategy a user invents — is an
 * instance of the schema below. The backend therefore implements exactly ONE
 * thing: an evaluator that reads this document. Not eleven bespoke plugins.
 *
 * ADR-024 grows the *vocabulary* without touching the *architecture*. A strategy
 * can now say far more — MACD, KDJ, divergence, break of structure, a bull flag
 * — but it is still one document, read by one evaluator.
 */

/* ── Indicators ────────────────────────────────────────────────────── */

/**
 * Everything a condition may talk about. Closed on purpose: a fixed vocabulary
 * is what makes user-authored strategies deterministic and safe to run.
 */
export const indicatorSchema = z.enum([
  // price
  "open",
  "high",
  "low",
  "close",

  // volume
  "volume",
  "volume_sma",
  "obv", // on-balance volume
  "cvd", // cumulative volume delta — tells forced selling from conviction selling
  "vwap",

  // moving averages
  "sma",
  "ema",

  // momentum
  "rsi",
  "macd_line",
  "macd_signal",
  "macd_histogram",
  "stoch_k",
  "stoch_d",
  "kdj_k",
  "kdj_d",
  "kdj_j",
  "cci",
  "williams_r",
  "roc",
  "mfi",

  // trend
  "adx",
  "plus_di",
  "minus_di",
  "supertrend",
  "psar",
  "ichimoku_tenkan",
  "ichimoku_kijun",
  "ichimoku_span_a",
  "ichimoku_span_b",

  // volatility
  "atr",
  "bb_upper",
  "bb_middle",
  "bb_lower",
  "bb_width",
  "keltner_upper",
  "keltner_lower",
  "donchian_upper",
  "donchian_lower",

  // structure
  "highest_high",
  "lowest_low",

  // derivatives — PERPETUAL only, and blocked on a data feed we do not have
  "funding_rate",
  "open_interest",
  "long_short_ratio",

  // statistics
  "zscore",
]);
export type Indicator = z.infer<typeof indicatorSchema>;

/** Indicators that need a data feed the platform does not have yet. */
export const DERIVATIVES_INDICATORS: Indicator[] = [
  "funding_rate",
  "open_interest",
  "long_short_ratio",
];

/* ── Operators ─────────────────────────────────────────────────────── */

/**
 * The operators a condition may use.
 *
 * **One way to say each thing.** There is no `slope_positive` next to `rising`,
 * and no `inside_range` next to `between` — synonyms look generous and are a tax:
 * two operators that mean the same thing are two code paths to keep in agreement,
 * two entries in the strategy editor, and one day a bug in only one of them.
 */
export const operatorSchema = z.enum([
  "gt", // >
  "gte", // >=
  "lt", // <
  "lte", // <=

  /**
   * Exact equality — and a warning.
   *
   * `eq` on a *computed* indicator is almost always a mistake: an EMA is a float,
   * and floats are not equal to round numbers. It is meaningful against a
   * discrete operand (a Supertrend direction, a bar count), and treacherous
   * everywhere else. The evaluator compares with a tolerance rather than `===`
   * for exactly this reason.
   */
  "eq",
  "neq",

  "crosses_above",
  "crosses_below",

  /** Within [min, max], inclusive. The spec's "inside range" is this. */
  "between",
  /** Outside [min, max]. Not `!between` — an unset value is neither. */
  "outside_range",

  /**
   * Against the indicator's OWN mean over N bars.
   *
   * "RSI above its own average" adapts to the instrument; "RSI above 50" does
   * not. The right operand is the lookback N.
   */
  "above_average",
  "below_average",

  /** Slope over N bars: "MACD histogram rising for 3 bars". */
  "rising",
  "falling",

  /**
   * Divergence — price makes a lower low while the indicator makes a higher low.
   *
   * This is among the highest-value signals in trading and could not be
   * expressed at all before ADR-024. The right operand is the lookback in bars.
   */
  "diverges_bullish",
  "diverges_bearish",
]);
export type Operator = z.infer<typeof operatorSchema>;

/** These read the left operand over N bars; the right operand is that N. */
export const BAR_COUNT_OPERATORS: Operator[] = [
  "rising",
  "falling",
  "above_average",
  "below_average",
  "diverges_bullish",
  "diverges_bearish",
];

/** These take a [min, max] pair rather than a single value. */
export const RANGE_OPERATORS: Operator[] = ["between", "outside_range"];

/* ── Patterns ──────────────────────────────────────────────────────── */

/**
 * Chart patterns and market structure.
 *
 * These cannot be expressed as `[indicator] [operator] [value]` — they need
 * swing detection and geometry — so they are a condition kind of their own. The
 * backend gains a pattern library; the architecture does not change.
 *
 * Deliberately ABSENT: head & shoulders, cup & handle, Elliott waves. Ten
 * traders draw them ten different ways. A deterministic detector for them would
 * be *inventing* certainty, and inventing certainty is the one thing this
 * platform exists not to do (ADR-024).
 */
export const patternSchema = z.enum([
  // ── Market structure — objective. The highest-value group, and it tells you
  //    whether a trend is actually intact.
  "HIGHER_HIGH_HIGHER_LOW", // uptrend structure
  "LOWER_HIGH_LOWER_LOW", // downtrend structure
  "BREAK_OF_STRUCTURE", // trend continues: a swing point is taken out
  "CHANGE_OF_CHARACTER", // trend may be ending: the first counter-break
  "LIQUIDITY_SWEEP", // stops taken, then reclaimed
  "FAIR_VALUE_GAP", // an imbalance price tends to revisit
  "ORDER_BLOCK", // the candle that caused the move
  "RANGE", // no trend: a floor and a ceiling

  /**
   * Equal highs / equal lows — a liquidity pool, in plain sight.
   *
   * Two or more swings at the same price are two or more clusters of stop orders
   * sitting just beyond it. Objective: "within N% of each other" is a measurement,
   * not an interpretation.
   */
  "EQUAL_HIGHS",
  "EQUAL_LOWS",

  // ── Reversal shapes — objective enough to trust
  "DOUBLE_TOP",
  "DOUBLE_BOTTOM",
  "TRIPLE_TOP",
  "TRIPLE_BOTTOM",

  // ── Geometry — real, but tunable. Always quality-scored.
  "BULL_FLAG",
  "BEAR_FLAG",
  "PENNANT",
  "FALLING_WEDGE",
  "RISING_WEDGE",
  "ASCENDING_TRIANGLE",
  "DESCENDING_TRIANGLE",
  "SYMMETRICAL_TRIANGLE",
  "ASCENDING_CHANNEL",
  "DESCENDING_CHANNEL",
]);
export type Pattern = z.infer<typeof patternSchema>;

/**
 * STILL REFUSED, and this is not an oversight to be helpfully fixed:
 *
 *   head & shoulders · inverse head & shoulders · cup & handle ·
 *   rounded top / bottom · broadening wedge · Elliott waves
 *
 * Ten traders draw a neckline ten different ways. A "deterministic" detector for
 * these would not be detecting anything — it would be picking ONE arbitrary
 * interpretation, stamping a quality score on it, and presenting the result as a
 * measurement. That is manufacturing certainty, which is the single thing this
 * platform exists not to do (ADR-024).
 *
 * A broadening wedge is the wedge family's version of the same problem: its
 * trendlines diverge, so almost any choppy stretch of chart can be fitted to it.
 *
 * `pattern-result.spec.ts` asserts this. If a future milestone asks for them
 * again, that is a request to overturn ADR-024, and it needs an ADR — not a
 * quiet addition to this list.
 */

/** Patterns whose detection is geometric and therefore a matter of degree. */
export const GEOMETRIC_PATTERNS: Pattern[] = [
  "BULL_FLAG",
  "BEAR_FLAG",
  "PENNANT",
  "FALLING_WEDGE",
  "RISING_WEDGE",
  "ASCENDING_TRIANGLE",
  "DESCENDING_TRIANGLE",
  "SYMMETRICAL_TRIANGLE",
  "ASCENDING_CHANNEL",
  "DESCENDING_CHANNEL",
];

/**
 * Patterns that are objectively true or false — they happened, or they did not.
 *
 * These score `quality: 1` by definition. A break of structure is not "0.8 of a
 * break": price either took out the swing high or it did not. Scoring them on a
 * curve would be inventing doubt to look rigorous, which is the mirror image of
 * inventing certainty and just as dishonest.
 */
export const OBJECTIVE_PATTERNS: Pattern[] = [
  "HIGHER_HIGH_HIGHER_LOW",
  "LOWER_HIGH_LOWER_LOW",
  "BREAK_OF_STRUCTURE",
  "CHANGE_OF_CHARACTER",
  "FAIR_VALUE_GAP",
  "EQUAL_HIGHS",
  "EQUAL_LOWS",
];

/* ── Operands ──────────────────────────────────────────────────────── */

/** One side of a comparison: a fixed number, or a computed indicator. */
export const operandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("number"),
    value: z.number(),
  }),
  z.object({
    kind: z.literal("indicator"),
    indicator: indicatorSchema,
    /** Lookback period, e.g. RSI(14) → 14. Omitted for raw price/volume. */
    period: z.number().int().positive().optional(),
    /**
     * Evaluate on a different timeframe than the strategy's own — this is how a
     * 1h strategy asks "but is the 4h trend up?". Signals are multi-timeframe.
     */
    timeframe: timeframeSchema.optional(),
    /** Scales the result, e.g. volume_sma(20) × 1.5. */
    multiplier: z.number().positive().optional(),
  }),
]);
export type Operand = z.infer<typeof operandSchema>;

/* ── Conditions ────────────────────────────────────────────────────── */

/** `left op right` — the ordinary case. */
export const comparisonConditionSchema = z.object({
  kind: z.literal("comparison"),
  left: operandSchema,
  op: operatorSchema,
  right: operandSchema,
  /** Upper bound — required by `between`, forbidden otherwise. */
  rightUpper: operandSchema.optional(),
});

/** "A bull flag is present, of at least this quality." */
export const patternConditionSchema = z.object({
  kind: z.literal("pattern"),
  pattern: patternSchema,
  /**
   * 0–1. How cleanly the shape must be formed before it counts.
   *
   * Objective structure (a break of structure either happened or it did not)
   * ignores this. Geometry — flags, wedges — is a matter of degree, and this is
   * the dial that decides how strict you want to be.
   */
  minQuality: z.number().min(0).max(1),
  timeframe: timeframeSchema.optional(),
});

export const conditionSchema = z
  .discriminatedUnion("kind", [
    comparisonConditionSchema,
    patternConditionSchema,
  ])
  .superRefine((condition, ctx) => {
    if (condition.kind !== "comparison") return;

    const wantsUpper = condition.op === "between";
    const hasUpper = condition.rightUpper !== undefined;
    if (wantsUpper !== hasUpper) {
      ctx.addIssue({
        code: "custom",
        message:
          "`between` requires an upper bound; every other operator forbids one",
        path: ["rightUpper"],
      });
    }
  });
export type Condition = z.infer<typeof conditionSchema>;
export type ComparisonCondition = z.infer<typeof comparisonConditionSchema>;
export type PatternCondition = z.infer<typeof patternConditionSchema>;

/* ── Exit rules ────────────────────────────────────────────────────── */

/** Where the stop goes. The stop defines the risk, and therefore the size. */
export const stopRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("atr"),
    period: z.number().int().positive(),
    multiplier: z.number().positive(),
  }),
  z.object({
    kind: z.literal("percent"),
    value: z.number().positive(),
  }),
  /** Below the lowest low (LONG) / above the highest high (SHORT). */
  z.object({
    kind: z.literal("structure"),
    lookback: z.number().int().positive(),
  }),
]);
export type StopRule = z.infer<typeof stopRuleSchema>;

/**
 * A take-profit, expressed in R — multiples of the distance to the stop — so a
 * target is always stated relative to the risk taken to reach it.
 */
export const targetRuleSchema = z.object({
  rMultiple: z.number().positive(),
  /** Portion of the position to close here, 1–100. Must total ≤ 100. */
  closePercent: z.number().min(1).max(100),
});
export type TargetRule = z.infer<typeof targetRuleSchema>;

/* ── The strategy document ─────────────────────────────────────────── */

export const strategyOriginSchema = z.enum(["BUILT_IN", "CUSTOM"]);
export type StrategyOrigin = z.infer<typeof strategyOriginSchema>;

/**
 * Live track record. This is what makes a confidence score mean something
 * (ADR-023): the platform earns trust from realised outcomes, not assertions.
 * `null` for a strategy that has not produced a settled signal yet.
 */
export const strategyRecordSchema = z.object({
  signals: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  /** Realised expectancy in R. Negative ⇒ the strategy must auto-disable. */
  expectancy: z.number(),
  avgR: z.number(),
});
export type StrategyRecord = z.infer<typeof strategyRecordSchema>;

export const strategyDefinitionSchema = z
  .object({
    id: z.string(),
    /** Plain trader English. "Breakout", not "Ignition". */
    name: z.string().min(1),
    /** One sentence a trader understands without a manual. */
    summary: z.string().min(1),

    origin: strategyOriginSchema,
    enabled: z.boolean(),

    direction: z.union([signalDirectionSchema, z.literal("BOTH")]),
    market: marketTypeSchema,
    timeframe: timeframeSchema,

    /**
     * THE MARKETS THIS STRATEGY IS FOR. Declared by the strategy, not by the engine.
     *
     * A strategy that prints money in a trend gets shredded in a range, and the
     * difference is the environment's fault rather than the strategy's. So every
     * strategy states the environments it belongs in, and the Regime Engine simply
     * publishes what the environment IS. It never decides which strategy suits it.
     *
     * ── Why this lives HERE and not in the Regime Engine ──
     *
     * The obvious alternative is a regime → strategy lookup table inside the engine.
     * It is faster to write and it quietly breaks the one rule ADR-023 exists to
     * protect: **a strategy is a document, and a user-created one takes the identical
     * code path as a built-in.** A strategy the engine has never heard of could never
     * appear in a hardcoded map, so every user strategy would be permanently
     * invisible to the regime filter — or, worse, silently treated as compatible with
     * everything.
     *
     * Empty means "no regime restriction", which is a real and legitimate answer for
     * a strategy that genuinely does not care.
     */
    regimes: z.array(marketRegimeSchema).default([]),

    /**
     * Markets this strategy must NOT be run in, whatever else agrees.
     *
     * Separate from `regimes` rather than inferred as its complement, because those
     * are different claims. "I work in a trend" is not the same as "I am actively
     * dangerous in a range" — the first is a preference, the second is a veto. A
     * mean-reversion strategy in a strong trend does not merely underperform; it
     * sells every new high all the way up.
     */
    avoidRegimes: z.array(marketRegimeSchema).default([]),

    /** ALL of these must be true to enter. Never empty. */
    entry: z.array(conditionSchema).min(1),
    /** Additional gates (higher-timeframe trend, liquidity). May be empty. */
    filters: z.array(conditionSchema),

    stop: stopRuleSchema,
    /** Ordered, nearest first. Must total ≤ 100% of the position. */
    targets: z.array(targetRuleSchema).min(1),

    /** Percent of account equity risked per trade. */
    riskPercent: z.number().positive().max(5),
    /** Null for SPOT. */
    maxLeverage: z.number().int().positive().nullable(),
    riskLevel: riskLevelSchema,

    /**
     * Null until the strategy has settled signals. A strategy with no record is
     * UNPROVEN: it may emit signals, but never a Prime one (ADR-023).
     */
    record: strategyRecordSchema.nullable(),
  })
  .refine((s) => s.targets.reduce((sum, t) => sum + t.closePercent, 0) <= 100, {
    message: "Targets cannot close more than 100% of the position",
    path: ["targets"],
  })
  .refine((s) => (s.market === "PERPETUAL") === (s.maxLeverage !== null), {
    message:
      "PERPETUAL strategies need a leverage cap; SPOT must not have one",
    path: ["maxLeverage"],
  })
  .refine((s) => s.market === "PERPETUAL" || s.direction !== "SHORT", {
    message: "A SHORT strategy must be PERPETUAL — spot cannot be shorted",
    path: ["direction"],
  });
export type StrategyDefinition = z.infer<typeof strategyDefinitionSchema>;

/** A strategy with no settled signals cannot be trusted with a Prime slot. */
export function isProven(strategy: StrategyDefinition): boolean {
  return strategy.record !== null && strategy.record.signals > 0;
}

/** True when a strategy needs the derivatives feed we do not have yet. */
export function needsDerivativesFeed(strategy: StrategyDefinition): boolean {
  const usesDerivatives = (conditions: Condition[]) =>
    conditions.some(
      (c) =>
        c.kind === "comparison" &&
        [c.left, c.right, c.rightUpper].some(
          (operand) =>
            operand?.kind === "indicator" &&
            (DERIVATIVES_INDICATORS as string[]).includes(operand.indicator),
        ),
    );

  return usesDerivatives(strategy.entry) || usesDerivatives(strategy.filters);
}
