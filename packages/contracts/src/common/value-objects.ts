import { z } from "zod";

/**
 * Value objects — primitives that refuse to be wrong.
 *
 * `number` is a terrible type for money. It will happily be `NaN`, `Infinity`,
 * `-0`, or `0` — and a `0` entry price is not a cheap trade, it is a broken feed
 * that will produce an infinite position size when someone divides by it.
 *
 * Each schema below is the *narrowest* type that can still hold a real value, so
 * the impossible states are unrepresentable rather than merely unlikely.
 *
 * These are schemas, not classes. A class would tempt someone to put a method on
 * it, and a method is behaviour — which contracts do not have (they describe
 * data, they never execute logic).
 */

/* ── Money and prices ──────────────────────────────────────────────── */

/**
 * A traded price. Strictly positive, finite.
 *
 * `.positive()` excludes 0 deliberately: an entry of 0 makes
 * `(equity × risk%) / |entry − stop|` divide by the entry and hand back a
 * position size of infinity. The schema is the last thing standing between a
 * broken exchange response and that.
 */
export const priceSchema = z.number().positive().finite();
export type Price = z.infer<typeof priceSchema>;

/** A monetary amount. May be zero (a position can be worth nothing) or negative (a loss). */
export const moneySchema = z.number().finite();
export type Money = z.infer<typeof moneySchema>;

/** A quantity of an asset. Positive; you cannot hold negative coins. */
export const quantitySchema = z.number().positive().finite();
export type Quantity = z.infer<typeof quantitySchema>;

/* ── Ratios ────────────────────────────────────────────────────────── */

/** A percentage, signed. +2.4 means "up 2.4%". */
export const percentageSchema = z.number().finite();
export type Percentage = z.infer<typeof percentageSchema>;

/** A percentage that cannot be negative — a win rate, a share of a spike. */
export const ratioSchema = z.number().min(0).max(100);
export type Ratio = z.infer<typeof ratioSchema>;

/**
 * Reward-to-risk. Strictly positive.
 *
 * A target that sits on the wrong side of entry yields a negative R:R, which is
 * not a bad trade — it is an incoherent one, and it should never be
 * representable.
 */
export const rewardRiskSchema = z.number().positive().finite();
export type RewardRisk = z.infer<typeof rewardRiskSchema>;

/** An R multiple — a result measured in units of the risk taken. May be negative. */
export const rMultipleSchema = z.number().finite();
export type RMultiple = z.infer<typeof rMultipleSchema>;

/* ── Confidence ────────────────────────────────────────────────────── */

/**
 * A confidence score, 0–100.
 *
 * A SCORE, NOT A PROBABILITY. Turning one into the other requires evidence, and
 * that machinery lives in `CalibratedConfidence` (ADR-024). A bare number here
 * makes no claim about how often it wins, and nothing may pretend otherwise.
 */
export const confidenceSchema = z.number().min(0).max(100);
export type ConfidenceScore = z.infer<typeof confidenceSchema>;

/* ── Leverage ──────────────────────────────────────────────────────── */

/**
 * Leverage. A whole number between 1 and 125.
 *
 * The ceiling is not a UI nicety. Above ~25× the liquidation price sits inside
 * the noise of most stops, at which point the stop is decoration and the account
 * is gone before the trade is even proven wrong. The Risk Engine caps far below
 * this; the schema simply refuses the absurd.
 */
export const leverageSchema = z.number().int().min(1).max(125);
export type Leverage = z.infer<typeof leverageSchema>;

/* ── Identity ──────────────────────────────────────────────────────── */

/** A base asset. "BTC", "SOL". Uppercase, no separator. */
export const symbolSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[A-Z0-9]+$/, "A symbol is uppercase letters and digits only");
export type Symbol = z.infer<typeof symbolSchema>;

/** A tradeable pair. "BTCUSDT". */
export const pairSchema = z
  .string()
  .min(5)
  .max(30)
  .regex(/^[A-Z0-9]+$/, "A pair is uppercase letters and digits only");
export type Pair = z.infer<typeof pairSchema>;

export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/* ── Time ──────────────────────────────────────────────────────────── */

/**
 * An ISO-8601 timestamp. Always UTC.
 *
 * A server in a local timezone silently mis-buckets candles, and a mis-bucketed
 * candle is a wrong indicator, which is a wrong signal. Time is not a
 * presentation concern here — it is an input to the maths.
 */
export const timestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof timestampSchema>;

/** Unix milliseconds. What exchanges actually send. */
export const epochMsSchema = z.number().int().nonnegative();
export type EpochMs = z.infer<typeof epochMsSchema>;

/** One point on a time series. Unix *seconds*, which is what charts want. */
export const timeSeriesPointSchema = z.object({
  time: z.number().int(),
  value: z.number(),
});
export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;
