import { z } from "zod";
import {
  marketTypeSchema,
  riskLevelSchema,
  signalDirectionSchema,
  timeframeSchema,
} from "./domain";

/**
 * A strategy is a DOCUMENT, not code.
 *
 * This is the load-bearing decision of the platform (ADR-023). Every strategy —
 * the five built-in ones and every strategy a user invents — is an instance of
 * the schema below. The backend therefore implements exactly ONE thing: an
 * evaluator that reads this document. Not eleven bespoke plugins.
 *
 * Three consequences follow:
 *   1. Built-in strategies are just seeded documents. Same code path.
 *   2. A user-created strategy is another row in the same table. No code
 *      execution, no sandbox, no security hole.
 *   3. The Strategies page renders the document as plain English for reading,
 *      and as form inputs for editing. The rules explain themselves.
 *
 * The honest limit: this vocabulary expresses price, volume, indicator,
 * funding and open-interest conditions. It CANNOT express news sentiment or
 * liquidation-cascade detection. Those are platform services, not strategies.
 */

/* ── Vocabulary ────────────────────────────────────────────────────── */

/**
 * Everything a condition is allowed to talk about. Fixed on purpose: a closed
 * vocabulary is what makes user-authored strategies deterministic and safe.
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
  // moving averages
  "sma",
  "ema",
  // oscillators
  "rsi",
  "adx",
  // volatility
  "atr",
  "bb_upper",
  "bb_middle",
  "bb_lower",
  "bb_width",
  // structure
  "highest_high",
  "lowest_low",
  "vwap",
  // derivatives (PERPETUAL only)
  "funding_rate",
  "open_interest",
  // statistics
  "zscore",
]);
export type Indicator = z.infer<typeof indicatorSchema>;

export const operatorSchema = z.enum([
  "gt", // >
  "gte", // >=
  "lt", // <
  "lte", // <=
  "crosses_above",
  "crosses_below",
  "between",
]);
export type Operator = z.infer<typeof operatorSchema>;

/** One side of a comparison: either a fixed number, or a computed indicator. */
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
     * Evaluate on a different timeframe than the strategy's own — this is how
     * a 1h strategy asks "is the 4h trend up?".
     */
    timeframe: timeframeSchema.optional(),
    /** Scales the result, e.g. volume_sma(20) × 1.5. */
    multiplier: z.number().positive().optional(),
  }),
]);
export type Operand = z.infer<typeof operandSchema>;

/** A single testable rule: `left op right`. */
export const conditionSchema = z
  .object({
    left: operandSchema,
    op: operatorSchema,
    right: operandSchema,
    /** Upper bound — required by `between`, forbidden otherwise. */
    rightUpper: operandSchema.optional(),
  })
  .refine((c) => (c.op === "between") === (c.rightUpper !== undefined), {
    message: "`between` requires rightUpper; every other operator forbids it",
    path: ["rightUpper"],
  });
export type Condition = z.infer<typeof conditionSchema>;

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
 * A take-profit. Expressed in R — multiples of the distance to the stop — so
 * a target is always stated relative to the risk taken to reach it.
 */
export const targetRuleSchema = z.object({
  /** e.g. 1.5 → exit at 1.5× the stop distance in profit. */
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
     * Null until the strategy has settled signals. A strategy with no record
     * is UNPROVEN: it may emit signals, but never a Prime one (ADR-023).
     */
    record: strategyRecordSchema.nullable(),
  })
  .refine(
    (s) => s.targets.reduce((sum, t) => sum + t.closePercent, 0) <= 100,
    {
      message: "Targets cannot close more than 100% of the position",
      path: ["targets"],
    },
  )
  .refine(
    (s) => (s.market === "PERPETUAL") === (s.maxLeverage !== null),
    {
      message: "PERPETUAL strategies need a leverage cap; SPOT must not have one",
      path: ["maxLeverage"],
    },
  )
  .refine((s) => s.market === "PERPETUAL" || s.direction !== "SHORT", {
    message: "A SHORT strategy must be PERPETUAL — spot cannot be shorted",
    path: ["direction"],
  });
export type StrategyDefinition = z.infer<typeof strategyDefinitionSchema>;

/** A strategy with no settled signals cannot be trusted with a Prime slot. */
export function isProven(strategy: StrategyDefinition): boolean {
  return strategy.record !== null && strategy.record.signals > 0;
}
