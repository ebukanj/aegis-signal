import { Injectable, Logger } from "@nestjs/common";
import type { Candle, Timeframe } from "@aegis/contracts";

/**
 * Multi-timeframe, without the caller knowing how.
 *
 * A 15-minute strategy asks for `EMA(1h)` and `ATR(4h)` and must not have to care
 * whether those candles were fetched from the exchange or built here from smaller
 * ones. This is the seam that makes that true.
 *
 * ── Fetch natively when you can; aggregate only when you must ──
 *
 * Binance publishes all four of our timeframes directly, so we ask for them
 * directly. Aggregating 240 fifteen-minute candles into a 1-day bar when the
 * exchange will simply hand you the 1-day bar is 240× the network cost and
 * introduces a class of bug (off-by-one bucketing) that fetching does not have.
 *
 * Aggregation exists here for the cases where it is genuinely needed — an exchange
 * that lacks a timeframe, a backtest replaying a single stored series across
 * several timeframes, and the tests, which is where most of its mileage will come
 * from.
 */
@Injectable()
export class TimeframeResolver {
  private readonly logger = new Logger(TimeframeResolver.name);

  /**
   * Aggregate candles up to a higher timeframe.
   *
   * ── The two rules, and they are both about not lying ──
   *
   * 1. **Buckets are aligned to the epoch, not to the first candle.** A 4h bar
   *    starts at 00:00, 04:00, 08:00 UTC — always, regardless of where our data
   *    happens to begin. Bucketing from the first candle we hold would produce
   *    bars that no exchange and no chart agrees with, and every indicator on them
   *    would disagree with TradingView for a reason nobody could find.
   *
   * 2. **A partial bucket is DROPPED, never emitted.** If the last four 15m
   *    candles only cover three quarters of an hour, there is no 1h candle yet —
   *    there is a *forming* one, and emitting it is exactly the look-ahead bias
   *    this module exists to prevent. Its high can still rise. Its close can still
   *    reverse.
   *
   * The second rule is why this returns fewer bars than a naive chunker would, and
   * why that is correct.
   */
  aggregate(
    candles: readonly Candle[],
    from: Timeframe,
    to: Timeframe,
  ): Candle[] {
    const fromMs = timeframeMs(from);
    const toMs = timeframeMs(to);

    if (toMs === fromMs) return [...candles];

    if (toMs < fromMs) {
      // You cannot invent detail you never had. A 1h candle does not contain four
      // 15m candles; it contains the *summary* of four, and the summary is lossy.
      throw new Error(
        `Cannot aggregate ${from} candles up to ${to} — ${to} is the SHORTER timeframe. ` +
          `Detail that was never collected cannot be recovered by division.`,
      );
    }

    if (toMs % fromMs !== 0) {
      throw new Error(
        `${from} does not divide evenly into ${to} — the buckets would not line up with any exchange's`,
      );
    }

    const expectedPerBucket = toMs / fromMs;
    const buckets = new Map<number, Candle[]>();

    for (const candle of candles) {
      // Epoch-aligned. This is rule 1.
      const bucketStart = Math.floor(candle.time / toMs) * toMs;

      const bucket = buckets.get(bucketStart);
      if (bucket) bucket.push(candle);
      else buckets.set(bucketStart, [candle]);
    }

    const out: Candle[] = [];

    for (const [start, members] of [...buckets.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      /*
       * Rule 2. An incomplete bucket is a FORMING bar, and it does not exist.
       *
       * This also silently drops a bucket with a hole in the middle, which is
       * correct for a different reason: a 4h bar built from three of its four 1h
       * candles has the wrong high, the wrong low and the wrong volume, and
       * nothing downstream could tell.
       */
      if (members.length !== expectedPerBucket) {
        this.logger.debug(
          { bucket: new Date(start).toISOString(), have: members.length, need: expectedPerBucket },
          "Dropping an incomplete higher-timeframe bucket — a partial bar is a forming bar",
        );
        continue;
      }

      members.sort((a, b) => a.time - b.time);

      const takerVolumes = members.map((m) => m.takerBuyVolume);
      const anyMissing = takerVolumes.some((v) => v === null);

      out.push({
        time: start,
        open: members[0].open,
        high: Math.max(...members.map((m) => m.high)),
        low: Math.min(...members.map((m) => m.low)),
        close: members[members.length - 1].close,
        volume: members.reduce((sum, m) => sum + m.volume, 0),

        /*
         * If ANY constituent lacks taker-buy volume, the aggregate does too.
         *
         * Summing the ones we have would produce a number that looks like the
         * bar's buy volume and is actually the buy volume of *part* of the bar —
         * understated by exactly the amount we could not see. CVD built on it
         * would drift steadily in one direction and look like genuine selling
         * pressure. Null is the only honest answer.
         */
        takerBuyVolume: anyMissing
          ? null
          : takerVolumes.reduce((sum: number, v) => sum + (v ?? 0), 0),
      });
    }

    return out;
  }

  /**
   * How much history to fetch so an indicator is not merely defined but stable.
   *
   * Recursive indicators (EMA, RSI, ATR, ADX) never fully forget their seed. An
   * EMA(200) computed from exactly 200 candles is a different number from the same
   * EMA computed from 1,000 — and a strategy that fires on "price crosses the 200
   * EMA" would fire at a different moment. So we fetch the stability requirement,
   * not the warmup requirement, and the extra candles cost one REST call.
   */
  requiredHistory(stabilityBars: number, buffer = 50): number {
    return Math.min(stabilityBars + buffer, 1_500);
  }
}

/** Bar duration in ms. The one place this mapping lives. */
export function timeframeMs(timeframe: Timeframe): number {
  const table: Record<Timeframe, number> = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
  };

  return table[timeframe];
}

/**
 * Can `from` be aggregated up into `to`?
 *
 * Used by the strategy editor to offer only the multi-timeframe combinations that
 * are actually derivable, rather than letting a user build a rule that can never
 * be evaluated.
 */
export function canAggregate(from: Timeframe, to: Timeframe): boolean {
  const fromMs = timeframeMs(from);
  const toMs = timeframeMs(to);

  return toMs > fromMs && toMs % fromMs === 0;
}
