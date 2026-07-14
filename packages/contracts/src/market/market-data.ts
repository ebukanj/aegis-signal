import { z } from "zod";
import { timeframeSchema } from "../domain";
import { exchangeIdSchema } from "../enums/platform";
import {
  epochMsSchema,
  pairSchema,
  percentageSchema,
  priceSchema,
  symbolSchema,
  timestampSchema,
} from "../common/value-objects";

/**
 * Market data — the only thing in this platform that is not an opinion.
 *
 * Everything downstream is derived from these: every indicator, every pattern,
 * every strategy evaluation, every confidence contributor. A wrong candle is a
 * wrong indicator is a wrong signal is a real loss. So these schemas are strict
 * to the point of pedantry, and that is the correct amount.
 */

/* ── Candles ───────────────────────────────────────────────────────── */

/**
 * One OHLCV candle.
 *
 * The refinement is the important part. An exchange under load, a bad merge, a
 * mis-parsed row — any of these can produce a candle whose high is below its
 * low. It looks like a number and it destroys every indicator computed from it,
 * silently, with no error anywhere. Reject it at the boundary.
 */
export const candleSchema = z
  .object({
    /** Candle OPEN time, unix ms. Never the close time — mixing them shifts
     *  every indicator by one bar, which is the definition of look-ahead bias. */
    time: epochMsSchema,
    open: priceSchema,
    high: priceSchema,
    low: priceSchema,
    close: priceSchema,
    /** Base-asset volume. May be zero on a dead bar; never negative. */
    volume: z.number().nonnegative().finite(),
  })
  .refine((c) => c.high >= c.low, {
    message: "A candle's high cannot be below its low",
    path: ["high"],
  })
  .refine((c) => c.high >= c.open && c.high >= c.close, {
    message: "A candle's high must be its highest price",
    path: ["high"],
  })
  .refine((c) => c.low <= c.open && c.low <= c.close, {
    message: "A candle's low must be its lowest price",
    path: ["low"],
  });
export type Candle = z.infer<typeof candleSchema>;

/** A series of candles for one pair on one timeframe. Ordered oldest → newest. */
export const candleSeriesSchema = z.object({
  exchange: exchangeIdSchema,
  pair: pairSchema,
  timeframe: timeframeSchema,
  candles: z.array(candleSchema),
  /**
   * Whether the LAST candle is still forming.
   *
   * This flag decides whether a strategy may look at it. Evaluating a rule
   * against an unclosed candle is look-ahead bias wearing a disguise: the bar
   * can still reverse, and a backtest that reads it will look brilliant and lose
   * money live. Strategies read closed candles. Always.
   */
  lastIsForming: z.boolean(),
  fetchedAt: timestampSchema,
});
export type CandleSeries = z.infer<typeof candleSeriesSchema>;

/* ── Ticker ────────────────────────────────────────────────────────── */

export const tickerSchema = z.object({
  exchange: exchangeIdSchema,
  pair: pairSchema,
  last: priceSchema,
  bid: priceSchema,
  ask: priceSchema,
  /** 24h quote volume in USD. The liquidity gate reads this. */
  quoteVolume24h: z.number().nonnegative(),
  changePercent24h: percentageSchema,
  at: timestampSchema,
});
export type Ticker = z.infer<typeof tickerSchema>;

/* ── Order book ────────────────────────────────────────────────────── */

/**
 * A summary, not the book.
 *
 * The full book is enormous, changes thousands of times a second, and no
 * strategy in this platform reads it. What the Risk Engine needs is the spread —
 * because an edge of 0.3% behind a spread of 0.08% is an edge that is eaten
 * before it arrives.
 */
export const orderBookSummarySchema = z
  .object({
    exchange: exchangeIdSchema,
    pair: pairSchema,
    bestBid: priceSchema,
    bestAsk: priceSchema,
    /** Spread as a percentage of price. The gate is 0.05%. */
    spreadPercent: z.number().nonnegative(),
    /** Notional resting within 1% of mid. Thin books slip. */
    bidDepth1Percent: z.number().nonnegative(),
    askDepth1Percent: z.number().nonnegative(),
    at: timestampSchema,
  })
  .refine((b) => b.bestAsk >= b.bestBid, {
    message: "The best ask cannot sit below the best bid — the book is crossed",
    path: ["bestAsk"],
  });
export type OrderBookSummary = z.infer<typeof orderBookSummarySchema>;

/* ── Derivatives ───────────────────────────────────────────────────── */

/**
 * Funding rate. PERPETUAL only.
 *
 * Positive means longs pay shorts — the crowd is long and paying to stay there.
 * That is fuel for a squeeze, and it is what the Crowd Squeeze strategy reads.
 */
export const fundingRateSchema = z.object({
  exchange: exchangeIdSchema,
  pair: pairSchema,
  /** Rate per interval, as a percentage. 0.01 = 0.01% per 8h. */
  rate: percentageSchema,
  intervalHours: z.number().positive(),
  nextFundingAt: timestampSchema,
  at: timestampSchema,
});
export type FundingRate = z.infer<typeof fundingRateSchema>;

export const openInterestSchema = z.object({
  exchange: exchangeIdSchema,
  pair: pairSchema,
  /** Open contracts, in base asset. */
  amount: z.number().nonnegative(),
  /** Notional value in USD. */
  notionalUsd: z.number().nonnegative(),
  at: timestampSchema,
});
export type OpenInterest = z.infer<typeof openInterestSchema>;

/**
 * A liquidation. Forced flow, not conviction.
 *
 * The distinction is the entire edge of the Reversal strategy: price falling
 * because sellers *want* out is a trend; price falling because an exchange is
 * *closing people out* is a mechanical air-pocket that tends to snap back.
 * Liquidation engines do not have opinions.
 */
export const liquidationSchema = z.object({
  exchange: exchangeIdSchema,
  pair: pairSchema,
  /** LONG means longs were liquidated — forced selling. */
  side: z.enum(["LONG", "SHORT"]),
  notionalUsd: z.number().positive(),
  price: priceSchema,
  at: timestampSchema,
});
export type Liquidation = z.infer<typeof liquidationSchema>;

/** Retail positioning. > 1 means more accounts are long than short. */
export const longShortRatioSchema = z.object({
  exchange: exchangeIdSchema,
  pair: pairSchema,
  ratio: z.number().positive(),
  at: timestampSchema,
});
export type LongShortRatio = z.infer<typeof longShortRatioSchema>;

/* ── The snapshot ──────────────────────────────────────────────────── */

/**
 * Everything known about one market at one instant.
 *
 * The derivatives fields are nullable and that is not laziness — the platform
 * does not have a derivatives feed yet, and a strategy that needs one (Crowd
 * Squeeze) ships DISABLED for exactly that reason. A `null` here is the truth;
 * a `0` would be a lie that reads as "funding is neutral".
 */
export const marketSnapshotSchema = z.object({
  exchange: exchangeIdSchema,
  symbol: symbolSchema,
  pair: pairSchema,
  ticker: tickerSchema,
  book: orderBookSummarySchema.nullable(),
  funding: fundingRateSchema.nullable(),
  openInterest: openInterestSchema.nullable(),
  longShortRatio: longShortRatioSchema.nullable(),
  at: timestampSchema,
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;
