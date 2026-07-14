import { Injectable, Logger } from "@nestjs/common";
import type { RegimeClassification, Timeframe } from "@aegis/contracts";
import { RedisService } from "../../../../core/cache/redis.service";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * The regime cache.
 *
 * Same discipline as the indicator and pattern caches: **the key IS the
 * invalidation.**
 *
 *     reg:BTC:1h:1752480000000
 *                └── the last CLOSED bar
 *
 * When a new bar closes the key changes, and the old entry is never asked for again.
 * No hook to forget, no race to lose. A cache that could serve a stale REGIME would
 * be the worst of the three: every strategy on the platform gates on it, so one
 * stale entry would silently mis-permission every one of them at once.
 */
@Injectable()
export class RegimeCache {
  private readonly logger = new Logger(RegimeCache.name);

  private hits = 0;
  private misses = 0;

  constructor(private readonly redis: RedisService) {}

  async get(ref: CacheRef): Promise<RegimeClassification | null> {
    try {
      const raw = await this.redis.client.get(this.key(ref));

      if (raw === null) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(raw) as RegimeClassification;
    } catch (error) {
      this.misses++;
      this.logger.warn({ err: error }, "Regime cache read failed — classifying instead");
      return null;
    }
  }

  async set(ref: CacheRef, value: RegimeClassification): Promise<void> {
    try {
      await this.redis.client.set(
        this.key(ref),
        JSON.stringify(value),
        "EX",
        Math.ceil((timeframeMs(ref.timeframe) * 3) / 1_000),
      );
    } catch (error) {
      this.logger.warn({ err: error }, "Regime cache write failed");
    }
  }

  private key(ref: CacheRef): string {
    return `reg:${ref.symbol}:${ref.timeframe}:${ref.lastClosedBar}`;
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
  lastClosedBar: number;
}
