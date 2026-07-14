import { Injectable, Logger } from "@nestjs/common";
import type {
  Candle,
  ExchangeId,
  FundingRate,
  OpenInterest,
  OrderBookSummary,
  Ticker,
  Timeframe,
} from "@aegis/contracts";
import { RedisService } from "../../../../core/cache/redis.service";

/**
 * The market cache.
 *
 * **The TTLs are the point, and they are not tuning knobs — they are safety
 * rails.**
 *
 * A cached price with no expiry is a price that will still be served after the
 * exchange has gone down, after the socket has died, after the market has moved
 * 5%. The application would have no way to know, and neither would the trader:
 * a stale number looks exactly like a fresh one.
 *
 * So every entry expires *shortly after the data would go stale*, and a cache
 * miss is a **feature**. A miss means "we do not currently know", which is the
 * truth, and the caller can go and find out. A stale hit is a lie that requires
 * no effort from anyone.
 *
 * The TTLs below are derived from how fast each thing actually changes:
 *
 *   ticker   10s   prices move constantly
 *   book      5s   depth evaporates in seconds
 *   candle   2×bar a 1h candle is valid for about an hour
 *   funding   5m   updates every 8h; 5m is generous
 *   OI        5m   likewise
 */
@Injectable()
export class MarketCache {
  private readonly logger = new Logger(MarketCache.name);

  private hits = 0;
  private misses = 0;

  private static readonly TTL = {
    ticker: 10,
    book: 5,
    funding: 300,
    openInterest: 300,
  } as const;

  constructor(private readonly redis: RedisService) {}

  /* ── Keys ────────────────────────────────────────────────────────── */

  private key(parts: (string | number)[]): string {
    return ["mkt", ...parts].join(":");
  }

  /* ── Ticker ──────────────────────────────────────────────────────── */

  async setTicker(exchange: ExchangeId, symbol: string, ticker: Ticker) {
    await this.put(
      this.key([exchange, symbol, "ticker"]),
      ticker,
      MarketCache.TTL.ticker,
    );
  }

  getTicker(exchange: ExchangeId, symbol: string): Promise<Ticker | null> {
    return this.take<Ticker>(this.key([exchange, symbol, "ticker"]));
  }

  /* ── Candles ─────────────────────────────────────────────────────── */

  /**
   * Only CLOSED candles are cached.
   *
   * A forming candle changes every tick, so caching it means serving a snapshot
   * of a bar that has already moved on — and a strategy that reads it is
   * evaluating a bar that no longer exists. Forming candles are streamed, never
   * stored.
   *
   * The TTL is twice the bar duration: long enough that the next bar is well
   * underway before this one expires, short enough that a dead feed cannot serve
   * an ancient bar as current.
   */
  async setCandle(
    exchange: ExchangeId,
    symbol: string,
    timeframe: Timeframe,
    candle: Candle,
  ) {
    const ttl = Math.ceil((timeframeSeconds(timeframe) * 2) / 1);
    await this.put(
      this.key([exchange, symbol, "candle", timeframe]),
      candle,
      ttl,
    );
  }

  getCandle(
    exchange: ExchangeId,
    symbol: string,
    timeframe: Timeframe,
  ): Promise<Candle | null> {
    return this.take<Candle>(this.key([exchange, symbol, "candle", timeframe]));
  }

  /* ── Book ────────────────────────────────────────────────────────── */

  async setOrderBook(
    exchange: ExchangeId,
    symbol: string,
    book: OrderBookSummary,
  ) {
    await this.put(
      this.key([exchange, symbol, "book"]),
      book,
      MarketCache.TTL.book,
    );
  }

  getOrderBook(
    exchange: ExchangeId,
    symbol: string,
  ): Promise<OrderBookSummary | null> {
    return this.take<OrderBookSummary>(this.key([exchange, symbol, "book"]));
  }

  /* ── Derivatives ─────────────────────────────────────────────────── */

  async setFunding(
    exchange: ExchangeId,
    symbol: string,
    funding: FundingRate,
  ) {
    await this.put(
      this.key([exchange, symbol, "funding"]),
      funding,
      MarketCache.TTL.funding,
    );
  }

  getFunding(
    exchange: ExchangeId,
    symbol: string,
  ): Promise<FundingRate | null> {
    return this.take<FundingRate>(this.key([exchange, symbol, "funding"]));
  }

  async setOpenInterest(
    exchange: ExchangeId,
    symbol: string,
    oi: OpenInterest,
  ) {
    await this.put(
      this.key([exchange, symbol, "oi"]),
      oi,
      MarketCache.TTL.openInterest,
    );
  }

  getOpenInterest(
    exchange: ExchangeId,
    symbol: string,
  ): Promise<OpenInterest | null> {
    return this.take<OpenInterest>(this.key([exchange, symbol, "oi"]));
  }

  /* ── Internals ───────────────────────────────────────────────────── */

  private async put(key: string, value: unknown, ttlSeconds: number) {
    try {
      await this.redis.client.set(
        key,
        JSON.stringify(value),
        "EX",
        ttlSeconds,
      );
    } catch (error) {
      // A cache write failing must never break the pipeline. The data still
      // flowed; we simply did not memoise it.
      this.logger.warn({ err: error, key }, "Cache write failed");
    }
  }

  private async take<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.client.get(key);

      if (raw === null) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn({ err: error, key }, "Cache read failed");
      this.misses++;
      return null;
    }
  }

  /** Feeds the Admin console. A collapsing hit rate means a feed is struggling. */
  stats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}

function timeframeSeconds(timeframe: Timeframe): number {
  const table: Record<Timeframe, number> = {
    "15m": 900,
    "1h": 3_600,
    "4h": 14_400,
    "1d": 86_400,
  };
  return table[timeframe];
}
