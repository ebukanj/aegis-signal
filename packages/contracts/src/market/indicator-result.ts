import { z } from "zod";
import { timeframeSchema } from "../domain";
import { indicatorSchema } from "../strategy";
import { epochMsSchema } from "../common/value-objects";

/**
 * What an indicator engine returns.
 *
 * Note what this file does NOT contain: any arithmetic. Contracts describe data;
 * they never compute it. The indicator engine lives in `apps/api` and is the only
 * thing allowed to turn candles into numbers — and the frontend is never allowed
 * to, because a number computed in `apps/web` is a number nobody validated
 * (07-BACKEND_REQUIREMENTS §0).
 *
 * The shape below is what makes that boundary enforceable rather than merely
 * agreed.
 */

/**
 * A single indicator value, at a bar.
 *
 * `value` is nullable and that is load-bearing. An EMA(200) has no value until
 * 200 bars exist. The honest answer for bar 3 is **null**, not 0 — and a 0 would
 * be read by a strategy as "price is above the 200 EMA", which on a fresh listing
 * is how you buy the top of a pump with a rule that thinks it is being careful.
 */
export const indicatorValueSchema = z.object({
  time: epochMsSchema,
  value: z.number().finite().nullable(),
});
export type IndicatorValue = z.infer<typeof indicatorValueSchema>;

/**
 * One computed indicator series.
 *
 * `warmupBars` is how many leading bars are null. A caller that ignores it and
 * reads `values[0]` gets a null and, if it is careless, a NaN that propagates
 * silently through every downstream calculation.
 */
export const indicatorSeriesSchema = z.object({
  indicator: indicatorSchema,
  /** e.g. RSI(14) → 14. Absent for raw price and volume. */
  period: z.number().int().positive().optional(),
  timeframe: timeframeSchema,
  values: z.array(indicatorValueSchema),
  /** Leading bars that could not be computed. Never read below this index. */
  warmupBars: z.number().int().nonnegative(),
});
export type IndicatorSeries = z.infer<typeof indicatorSeriesSchema>;

/**
 * The indicators a strategy asked for, computed for one pair.
 *
 * Keyed by a canonical string ("rsi:14:1h") so a strategy document that mentions
 * the same indicator twice — on two timeframes — resolves to two entries rather
 * than one silently overwriting the other.
 */
export const indicatorSetSchema = z.object({
  pair: z.string(),
  series: z.record(z.string(), indicatorSeriesSchema),
});
export type IndicatorSet = z.infer<typeof indicatorSetSchema>;

/**
 * The canonical key for an indicator instance.
 *
 * Not a calculation — a naming rule, and it belongs here so the backend that
 * writes the key and the frontend that reads it cannot disagree about it.
 */
export function indicatorKey(input: {
  indicator: string;
  period?: number;
  timeframe: string;
}): string {
  return [input.indicator, input.period ?? "-", input.timeframe].join(":");
}
