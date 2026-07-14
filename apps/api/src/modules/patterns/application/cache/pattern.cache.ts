import { Injectable, Logger } from "@nestjs/common";
import type { MarketStructure, PatternSet, Timeframe } from "@aegis/contracts";
import { RedisService } from "../../../../core/cache/redis.service";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * The pattern cache.
 *
 * Same discipline as the indicator cache, for the same reason: **the key IS the
 * invalidation.**
 *
 *     pat:BTC:1h:s5:1752480000000
 *                   └── the last CLOSED bar
 *
 * There is no invalidation logic in this file and there must not be. When a new bar
 * closes, the timestamp changes, the key changes, and the old entry is simply never
 * asked for again.
 *
 * The milestone brief asks the cache to "automatically invalidate after new
 * confirmed swings". A hook that deletes entries when swings change has a failure
 * mode this design cannot have: if the hook ever misses — a dropped event, a worker
 * restart mid-close, a race between two closes — the platform serves a market
 * structure computed from OLD CANDLES while believing it is current. A strategy
 * would be told the trend is intact based on swings that no longer exist. Nothing
 * would error. Nothing would look wrong.
 *
 * A new confirmed swing can only appear when a new bar closes, and a new bar
 * changes the key. The requirement is therefore satisfied *structurally* rather
 * than by a hook someone can forget to call.
 *
 * The swing STRENGTH is in the key too — patterns detected at strength 3 and
 * strength 5 are different patterns, and a key that omitted it would serve one
 * while the caller believed it was reading the other.
 */
@Injectable()
export class PatternCache {
  private readonly logger = new Logger(PatternCache.name);

  private hits = 0;
  private misses = 0;

  constructor(private readonly redis: RedisService) {}

  async get(ref: CacheRef): Promise<(PatternSet & { structure: MarketStructure }) | null> {
    try {
      const raw = await this.redis.client.get(this.key(ref));

      if (raw === null) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(raw) as PatternSet & { structure: MarketStructure };
    } catch (error) {
      /*
       * Redis being down must degrade the platform to SLOWER — never to wrong, and
       * never to off. A failed read counts as a miss, and the caller detects, which
       * is exactly what it would have done anyway.
       */
      this.misses++;
      this.logger.warn({ err: error }, "Pattern cache read failed — detecting instead");
      return null;
    }
  }

  async set(
    ref: CacheRef,
    value: PatternSet & { structure: MarketStructure },
  ): Promise<void> {
    try {
      await this.redis.client.set(
        this.key(ref),
        JSON.stringify(value),
        "EX",
        ttlFor(ref.timeframe),
      );
    } catch (error) {
      // A failed WRITE must never fail the request. The patterns are correct; they
      // simply were not saved.
      this.logger.warn({ err: error }, "Pattern cache write failed");
    }
  }

  private key(ref: CacheRef): string {
    return `pat:${ref.symbol}:${ref.timeframe}:s${ref.strength}:${ref.lastClosedBar}`;
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
  timeframe: Timeframe;
  strength: number;
  /** Open time of the last CLOSED candle. */
  lastClosedBar: number;
}

/**
 * Three bars' worth of life.
 *
 * The entry becomes unreachable the moment the next bar closes (its key changes),
 * so the TTL is not what makes it correct — it only stops Redis filling with keys
 * nobody will ask for again.
 */
function ttlFor(timeframe: Timeframe): number {
  return Math.ceil((timeframeMs(timeframe) * 3) / 1_000);
}
