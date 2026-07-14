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

/* ── Parameters ────────────────────────────────────────────────────── */

/**
 * An indicator's parameters.
 *
 * `period` alone cannot describe this vocabulary. MACD is three numbers
 * (12, 26, 9), Bollinger is a period *and* a standard-deviation multiplier,
 * Stochastic is three, Ichimoku is three, Supertrend is a period and a factor.
 * Collapsing them to one number would force the engine to smuggle the rest in
 * through side channels — and two callers asking for "MACD" would silently get
 * whatever the last one configured.
 *
 * Every field is optional because every indicator uses a different subset, and
 * each calculator declares its own defaults. **The defaults are the conventional
 * ones** (RSI 14, MACD 12/26/9, Bollinger 20/2) — not because convention is
 * correct, but because a trader comparing our RSI against TradingView must be
 * comparing the same thing before any disagreement means anything.
 */
export const indicatorParamsSchema = z.object({
  /** The lookback. RSI(14), EMA(200), ATR(14). */
  period: z.number().int().positive().max(5_000).optional(),

  /** MACD, and anything else with a fast/slow pair. */
  fastPeriod: z.number().int().positive().max(5_000).optional(),
  slowPeriod: z.number().int().positive().max(5_000).optional(),
  signalPeriod: z.number().int().positive().max(5_000).optional(),

  /** Stochastic and KDJ smoothing. */
  kPeriod: z.number().int().positive().max(5_000).optional(),
  dPeriod: z.number().int().positive().max(5_000).optional(),
  smoothing: z.number().int().positive().max(5_000).optional(),

  /** Bollinger standard deviations; Keltner and Supertrend ATR multiples. */
  multiplier: z.number().positive().max(100).optional(),

  /** Ichimoku: conversion, base, span B. */
  conversionPeriod: z.number().int().positive().max(5_000).optional(),
  basePeriod: z.number().int().positive().max(5_000).optional(),
  spanBPeriod: z.number().int().positive().max(5_000).optional(),

  /** Parabolic SAR acceleration and its ceiling. */
  step: z.number().positive().max(1).optional(),
  maxStep: z.number().positive().max(1).optional(),

  /** Which price the indicator reads. Defaults per indicator. */
  source: z
    .enum(["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"])
    .optional(),
});
export type IndicatorParams = z.infer<typeof indicatorParamsSchema>;

/** What the engine is asked to compute. */
export const indicatorRequestSchema = z.object({
  indicator: indicatorSchema,
  timeframe: timeframeSchema,
  params: indicatorParamsSchema.default({}),
});
export type IndicatorRequest = z.infer<typeof indicatorRequestSchema>;

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
  /** The full parameter set this series was computed with. Part of its identity. */
  params: indicatorParamsSchema.optional(),
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

/* ── Keys ──────────────────────────────────────────────────────────── */

/**
 * The canonical key for an indicator instance.
 *
 * Not a calculation — a naming rule, and it belongs here so the backend that
 * writes the key and the frontend that reads it cannot disagree about it.
 *
 * **The parameters are part of the identity.** EMA(50) and EMA(200) are not the
 * same indicator, and a key that omitted the period would let one overwrite the
 * other in the cache — serving a strategy the 50 EMA while it believed it was
 * reading the 200. The keys are sorted, so `{fast:12, slow:26}` and
 * `{slow:26, fast:12}` are the same instance rather than two cache entries and
 * two computations of an identical number.
 */
export function indicatorKey(input: {
  indicator: string;
  timeframe: string;
  params?: IndicatorParams;
  /** Legacy shorthand. Equivalent to `params: { period }`. */
  period?: number;
}): string {
  const params: IndicatorParams = {
    ...(input.period !== undefined ? { period: input.period } : {}),
    ...input.params,
  };

  const encoded = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

  return [input.indicator, encoded || "-", input.timeframe].join(":");
}
