import { Injectable, Logger } from "@nestjs/common";
import type { Indicator, IndicatorParams, Timeframe } from "@aegis/contracts";
import { indicatorKey } from "@aegis/contracts";
import { RedisService } from "../../../../core/cache/redis.service";
import type { Maybe } from "../math/rolling";
import { timeframeMs } from "../services/timeframe.resolver";

/**
 * The indicator cache.
 *
 * The scanner evaluates ~19 symbols × 4 timeframes × a dozen indicators every time
 * a bar closes, and several strategies want the same RSI(14). Computing it once
 * and reading it back is the difference between a scan that finishes inside a bar
 * and one that does not.
 *
 * ── The key IS the invalidation ──
 *
 * There is no invalidation logic in this file, and there must not be. The last
 * closed candle's timestamp is part of the key:
 *
 *     ind:BTC:1h:rsi:period=14:1752480000000
 *                              └── the bar this was computed through
 *
 * When a new bar closes, the timestamp changes, and the key changes. The old entry
 * is not stale — it is simply never asked for again, and Redis evicts it when the
 * TTL runs out.
 *
 * The alternative — a cache keyed without the bar time, plus a "delete on new
 * candle" hook — has a failure mode this design cannot have: if the invalidation
 * hook ever misses (a dropped event, a worker restart mid-close, a race between
 * two closes), the platform serves an indicator computed from OLD CANDLES while
 * believing it is current. Every strategy reading it would be evaluating the
 * previous bar's market. Nothing would error. Nothing would look wrong.
 *
 * **A cache that can serve stale market data is worse than no cache at all.** This
 * one cannot, structurally, so no hook can be forgotten.
 *
 * ── The parameters are in the key too ──
 *
 * EMA(50) and EMA(200) are different indicators. A key that omitted the period
 * would let one overwrite the other, and a strategy asking for the 200 EMA would
 * be handed the 50 — a number that is entirely plausible and completely wrong.
 */
@Injectable()
export class IndicatorCache {
  private readonly logger = new Logger(IndicatorCache.name);

  private hits = 0;
  private misses = 0;

  constructor(private readonly redis: RedisService) {}

  async get(input: CacheRef): Promise<Maybe[] | null> {
    const key = this.key(input);

    try {
      const raw = await this.redis.client.get(key);

      if (raw === null) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(raw) as Maybe[];
    } catch (error) {
      /*
       * A cache failure is not a calculation failure.
       *
       * Redis being down must degrade the platform to "slower", never to "wrong"
       * and never to "off". We count it as a miss and the caller computes the
       * value — which is exactly what it would have done anyway.
       */
      this.misses++;
      this.logger.warn({ err: error, key }, "Indicator cache read failed — computing instead");
      return null;
    }
  }

  async set(input: CacheRef, values: readonly Maybe[]): Promise<void> {
    const key = this.key(input);

    try {
      await this.redis.client.set(key, JSON.stringify(values), "EX", ttlFor(input.timeframe));
    } catch (error) {
      // Never let a failed cache WRITE fail the request. The number is correct;
      // it just was not saved.
      this.logger.warn({ err: error, key }, "Indicator cache write failed");
    }
  }

  /**
   * `ind:{symbol}:{indicator}:{params}:{timeframe}:{lastClosedBar}`
   *
   * `indicatorKey` is imported from the CONTRACTS, not reimplemented here, so the
   * backend that writes the key and anything that later reads it cannot drift
   * apart on the naming rule.
   */
  private key(input: CacheRef): string {
    const identity = indicatorKey({
      indicator: input.indicator,
      timeframe: input.timeframe,
      params: input.params,
    });

    return `ind:${input.symbol}:${identity}:${input.lastClosedBar}`;
  }

  stats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}

export interface CacheRef {
  symbol: string;
  indicator: Indicator;
  params: IndicatorParams;
  timeframe: Timeframe;
  /** Open time of the last CLOSED candle the series was computed through. */
  lastClosedBar: number;
}

/**
 * Three bars' worth of life.
 *
 * The entry becomes unreachable the moment the next bar closes (its key changes),
 * so the TTL is not what makes it correct — it is only what stops Redis filling up
 * with keys nobody will ever ask for again. Three bars is long enough that a
 * late-arriving request for the previous bar still hits, and short enough that a
 * 15m indicator does not squat in memory for a day.
 */
function ttlFor(timeframe: Timeframe): number {
  return Math.ceil((timeframeMs(timeframe) * 3) / 1_000);
}
