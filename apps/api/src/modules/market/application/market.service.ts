import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomUUID } from "node:crypto";
import type {
  Candle,
  ExchangeId,
  OrderBookSummary,
  Ticker,
  Timeframe,
} from "@aegis/contracts";
import { EVENT } from "@aegis/contracts";
import { DEFAULT_UNIVERSE, EXCHANGES, enabledExchanges } from "../market.config";
import type {
  ExchangeHealth,
  IExchangeAdapter,
} from "../domain/exchange-adapter.interface";
import { SymbolRegistry } from "../domain/symbol-registry";
import { MarketNormalizer } from "../infrastructure/normalizers/market.normalizer";
import { MarketCache } from "../infrastructure/cache/market.cache";
import { createExchangeLookup } from "../infrastructure/exchange-dns";
import { BinanceAdapter } from "../infrastructure/adapters/binance.adapter";
import { timeframeMs } from "../../indicators/application/services/timeframe.resolver";
import { CcxtRestAdapter } from "../infrastructure/adapters/ccxt-rest.adapter";
import { AppConfigService } from "../../../config/app-config.service";

/**
 * The market service — the heartbeat.
 *
 * It owns the adapters, warms the registry, opens the streams, caches what
 * arrives, and republishes it as canonical domain events. **It contains no
 * trading logic** and it never will: indicators, patterns, strategies, risk and
 * signals all live downstream and all assume this data is accurate, timely and
 * normalized (AGENTS.md §5).
 *
 * If this layer is wrong, every decision built on it is wrong — and wrong in a
 * way nothing downstream can detect, because a bad candle looks exactly like a
 * good one.
 */
@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);
  private readonly adapters = new Map<ExchangeId, IExchangeAdapter>();

  /** Where a live price comes from. The primary is the one with a socket. */
  private primary: BinanceAdapter | null = null;

  /** Set while the stream is mute and prices are coming from REST instead. */
  private pollTimer: NodeJS.Timeout | null = null;
  private streamDegraded = false;

  constructor(
    private readonly registry: SymbolRegistry,
    private readonly normalizer: MarketNormalizer,
    private readonly cache: MarketCache,
    private readonly events: EventEmitter2,
    private readonly config: AppConfigService,
  ) {}

  /* ── Boot ────────────────────────────────────────────────────────── */

  async onModuleInit(): Promise<void> {
    /*
     * Undefined unless the local network filters exchanges at the DNS layer, in
     * which case every adapter would otherwise report ENOTFOUND and look exactly
     * like a total exchange outage. Unset in production. See `exchange-dns.ts`.
     */
    const lookup = createExchangeLookup(this.config.exchange.dnsServers);

    for (const config of enabledExchanges()) {
      const adapter =
        config.id === "BINANCE"
          ? new BinanceAdapter(config, this.registry, this.normalizer, lookup)
          : new CcxtRestAdapter(config, this.registry, this.normalizer, lookup);

      this.adapters.set(config.id, adapter);
    }

    /*
     * Connect every exchange in parallel, and DO NOT let one failure stop the
     * others.
     *
     * `allSettled`, not `all`. If OKX is down at boot, that must not prevent
     * Binance from streaming — one exchange going down cannot be allowed to
     * blind the platform (PRD §14, Reliability). The failed adapter's circuit
     * breaker will keep probing it, and it joins when it recovers.
     */
    const results = await Promise.allSettled(
      [...this.adapters.values()].map(async (adapter) => {
        await adapter.connect();
        await adapter.fetchSymbols();
        return adapter.id;
      }),
    );

    for (const [index, result] of results.entries()) {
      const id = [...this.adapters.keys()][index];

      if (result.status === "rejected") {
        this.logger.error(
          { exchange: id, err: result.reason },
          "Exchange failed to connect — the platform continues without it",
        );
        continue;
      }

      this.events.emit("exchange.connected", { exchange: id });
    }

    this.registry.logSummary();

    // Binance is the one with a socket. Wire its stream into the pipeline.
    const binance = this.adapters.get("BINANCE");
    if (binance instanceof BinanceAdapter) {
      this.primary = binance;
      this.wireStream(binance);
      await this.subscribeUniverse(binance);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPricePolling();

    await Promise.allSettled(
      [...this.adapters.values()].map((a) => a.disconnect()),
    );
  }

  /* ── Streams ─────────────────────────────────────────────────────── */

  private wireStream(adapter: BinanceAdapter): void {
    adapter.stream.on(
      "candle",
      async (payload: {
        exchange: ExchangeId;
        symbol: string;
        timeframe: Timeframe;
        candle: Candle;
        closed: boolean;
      }) => {
        /*
         * A FORMING CANDLE IS NOT AN EVENT.
         *
         * It is cached by nobody and it wakes nothing downstream. A strategy that
         * evaluates against an unclosed bar is committing look-ahead bias: the
         * bar can still reverse, so the trade was taken on information that did
         * not exist yet. It backtests beautifully and it loses money live.
         *
         * The pipeline moves on CLOSE. Only on close.
         */
        if (!payload.closed) return;

        await this.cache.setCandle(
          payload.exchange,
          payload.symbol,
          payload.timeframe,
          payload.candle,
        );

        this.events.emit(EVENT.MARKET_UPDATED, {
          eventId: randomUUID(),
          correlationId: randomUUID(),
          occurredAt: new Date().toISOString(),
          name: EVENT.MARKET_UPDATED,
          exchange: payload.exchange,
          pair: `${payload.symbol}USDT`,
          timeframe: payload.timeframe,
          closedCandleTime: payload.candle.time,
        });
      },
    );

    adapter.stream.on(
      "ticker",
      async (payload: {
        exchange: ExchangeId;
        symbol: string;
        ticker: Ticker;
      }) => {
        await this.cache.setTicker(
          payload.exchange,
          payload.symbol,
          payload.ticker,
        );

        // The frontend's live price rides this. Emitted on every tick because a
        // price that updates once a minute is a price a trader cannot act on.
        this.events.emit("market.price", {
          symbol: payload.symbol,
          ticker: payload.ticker,
        });
      },
    );

    /*
     * The socket is open, acknowledged, and mute.
     *
     * Not a dropped connection — those reconnect and recover. This is a socket
     * the network is holding shut, and no amount of reconnecting will shake a
     * price out of it. Polling REST is slower (seconds, not milliseconds) but the
     * prices are REAL and they are from the SAME perpetual market the signal is
     * on, which is the part that cannot be compromised.
     *
     * Worth having in production too: a WebSocket outage should slow the platform
     * down, not blind it.
     */
    adapter.stream.on("degraded", (payload: { reason: string }) => {
      this.startPricePolling(adapter, payload.reason);
    });

    adapter.stream.on("live", () => {
      this.stopPricePolling();
    });

    adapter.stream.on("disconnected", (payload: { reason: string }) => {
      this.events.emit("exchange.disconnected", {
        exchange: adapter.id,
        reason: payload.reason,
      });
    });

    adapter.stream.on(
      "reconnected",
      (payload: { afterMs: number; attempts: number }) => {
        this.events.emit("exchange.recovered", {
          exchange: adapter.id,
          ...payload,
        });
      },
    );
  }

  /* ── The REST fallback ───────────────────────────────────────────── */

  /**
   * Poll REST for prices when the stream cannot deliver them.
   *
   * One batched call per tick, for the whole watched universe — 20 requests a
   * minute against a budget of 900, so it costs almost nothing and still goes
   * through the circuit breaker and the rate limiter like everything else.
   *
   * Three seconds, not five hundred milliseconds. That is a real downgrade and it
   * is stated plainly rather than hidden: the "still at entry / chasing / missed"
   * verdict on a signal is now up to three seconds stale. It is not fabricated,
   * and it is not from the wrong market. Those are the two things that were never
   * negotiable.
   */
  private startPricePolling(adapter: IExchangeAdapter, reason: string): void {
    if (this.pollTimer) return;

    const symbols = [...DEFAULT_UNIVERSE].filter((symbol) =>
      this.registry.lists(adapter.id, { symbol, marketType: "PERPETUAL" }),
    );

    this.logger.warn(
      { exchange: adapter.id, reason, symbols: symbols.length, intervalMs: POLL_INTERVAL_MS },
      "Live prices are now polled over REST — slower, but real and from the right market",
    );

    this.streamDegraded = true;

    const poll = async (): Promise<void> => {
      try {
        const tickers = await adapter.fetchTickers(symbols);

        for (const ticker of tickers) {
          const symbol = this.registry.canonicalise(ticker.pair);
          if (!symbol) continue;

          await this.cache.setTicker(adapter.id, symbol, ticker);
          this.events.emit("market.price", { symbol, ticker });
        }
      } catch (error) {
        // The breaker is already tracking this. Do not let a failed poll kill the
        // interval — that would turn a slow feed into no feed.
        this.logger.error({ err: error }, "REST price poll failed");
      }
    };

    void poll();
    this.pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }

  private stopPricePolling(): void {
    if (!this.pollTimer) return;

    clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.streamDegraded = false;

    this.logger.log("The WebSocket is delivering again — REST polling stopped");
  }

  /** Subscribe the default universe to tickers and 1h candles. */
  private async subscribeUniverse(adapter: BinanceAdapter): Promise<void> {
    let subscribed = 0;

    for (const symbol of DEFAULT_UNIVERSE) {
      // Only subscribe to what the exchange actually lists. A subscription to a
      // market that does not exist is a stream that never fires, and nothing in
      // the logs to say so.
      if (!this.registry.lists(adapter.id, { symbol, marketType: "PERPETUAL" })) {
        continue;
      }

      await adapter.subscribe({ kind: "ticker", symbol });
      await adapter.subscribe({ kind: "candle", symbol, timeframe: "1h" });
      subscribed++;
    }

    this.logger.log({ symbols: subscribed }, "Subscribed to the universe");
  }

  /* ── Queries ─────────────────────────────────────────────────────── */

  /**
   * Candles for a strategy.
   *
   * Always returns CLOSED candles only. The caller cannot opt out, because the
   * caller is a strategy and a strategy has no legitimate use for a forming bar.
   */
  async candles(input: {
    exchange?: ExchangeId;
    symbol: string;
    timeframe: Timeframe;
    limit?: number;
  }): Promise<Candle[]> {
    const adapter = this.adapterFor(input.exchange);
    const requested = input.limit ?? 300;

    /*
     * Ask for one MORE than we intend to return.
     *
     * The newest bar an exchange hands back is almost always still forming, and
     * we drop it — a strategy that evaluates an unclosed bar is committing
     * look-ahead bias. But if we ask for exactly `requested`, dropping it leaves
     * `requested - 1`, and a strategy asking for 200 candles to seed an EMA(200)
     * gets 199 — one short, so the indicator returns null on the bar that matters
     * and the strategy simply never fires. No error. No warning. Just a rule that
     * quietly never triggers.
     */
    const { candles, lastIsForming } = await adapter.fetchCandles({
      symbol: input.symbol,
      timeframe: input.timeframe,
      limit: requested + 1,
    });

    const closed = lastIsForming ? candles.slice(0, -1) : candles;

    return closed.slice(-requested);
  }

  /**
   * Deep history, paged.
   *
   * An exchange returns at most ~1,500 candles per request, and the confidence
   * engine's replay needs two YEARS of hourly bars — about 17,500. So it pages
   * backwards from the present, one request at a time.
   *
   * ── The two things that make this correct rather than merely working ──
   *
   * **It stops when the exchange stops.** A page that returns nothing new means we
   * have reached the start of the pair's listed history, and the loop ends. It does
   * not retry, and it does not pad — a corpus quietly shortened by a delisting is a
   * corpus that says so, by being short.
   *
   * **It deduplicates and re-sorts.** Pages overlap at their boundaries and some
   * exchanges are careless about the edges. A duplicated candle in a replay is a
   * duplicated SETUP, and a duplicated setup is a free sample — the cheapest way in
   * the world to halve your uncertainty without learning anything.
   */
  async history(input: {
    exchange?: ExchangeId;
    symbol: string;
    timeframe: Timeframe;
    bars: number;
  }): Promise<Candle[]> {
    const adapter = this.adapterFor(input.exchange);

    const PAGE = 1000;
    const span = timeframeMs(input.timeframe);

    const byTime = new Map<number, Candle>();

    /* Page backwards from now, until we have enough or the exchange runs out. */
    let until = Date.now();

    while (byTime.size < input.bars) {
      const since = until - PAGE * span;

      const { candles } = await adapter.fetchCandles({
        symbol: input.symbol,
        timeframe: input.timeframe,
        limit: PAGE,
        since,
      });

      const fresh = candles.filter((c) => !byTime.has(c.time));

      if (fresh.length === 0) {
        /* Streaming min — `Math.min(...keys)` would spread tens of thousands of
         * timestamps onto the stack and can overflow it. */
        let earliest = Number.POSITIVE_INFINITY;
        for (const time of byTime.keys()) if (time < earliest) earliest = time;

        this.logger.warn(
          `${input.symbol} ${input.timeframe}: history ends at ${new Date(earliest)
            .toISOString()
            .slice(0, 10)} — the pair does not go back far enough for ${input.bars} bars, and the corpus will be correspondingly shorter rather than padded`,
        );
        break;
      }

      for (const candle of candles) byTime.set(candle.time, candle);

      until = since;
    }

    const sorted = [...byTime.values()].sort((a, b) => a.time - b.time);

    /*
     * Drop the newest bar if it is still forming. A strategy evaluated on an
     * unclosed candle is committing look-ahead bias, and in a replay that error
     * would be silently baked into every statistic downstream.
     */
    const complete =
      sorted.length > 0 && sorted[sorted.length - 1].time + span > Date.now()
        ? sorted.slice(0, -1)
        : sorted;

    return complete.slice(-input.bars);
  }

  async ticker(symbol: string, exchange?: ExchangeId): Promise<Ticker> {
    const id = exchange ?? "BINANCE";

    const cached = await this.cache.getTicker(id, symbol);
    if (cached) return cached;

    const ticker = await this.adapterFor(exchange).fetchTicker(symbol);
    await this.cache.setTicker(id, symbol, ticker);

    return ticker;
  }

  /**
   * The order book — the only place the platform can see the SPREAD.
   *
   * The Risk Engine's spread gate depends on this, and the spread is not a detail: an
   * edge of 0.3% behind a spread of 0.08% is an edge that is eaten before it arrives.
   * A platform that never looked would happily approve trades whose profit was already
   * gone at the moment of entry.
   *
   * Cached for 5 seconds and no longer. Depth evaporates in seconds, and a stale book
   * is worse than none: it reports a tight spread on a market that has just gone thin,
   * which is precisely when a trader most needs to be told.
   */
  async orderBook(symbol: string, exchange?: ExchangeId): Promise<OrderBookSummary> {
    const id = exchange ?? "BINANCE";

    const cached = await this.cache.getOrderBook(id, symbol);
    if (cached) return cached;

    const book = await this.adapterFor(exchange).fetchOrderBook(symbol);
    await this.cache.setOrderBook(id, symbol, book);

    return book;
  }

  /** Latest price for every subscribed symbol. Served from cache. */
  async prices(symbols: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};

    for (const symbol of symbols) {
      const ticker = await this.cache.getTicker("BINANCE", symbol);
      if (ticker) out[symbol] = ticker.last;
    }

    return out;
  }

  /* ── Health ──────────────────────────────────────────────────────── */

  health(): ExchangeHealth[] {
    return [...this.adapters.values()].map((a) => a.health());
  }

  metrics() {
    return {
      exchanges: this.health(),
      cache: this.cache.stats(),
      rejectedRows: this.normalizer.rejectionCounts(),
      symbolsRegistered: this.registry.size(),
      streaming: this.primary !== null && !this.streamDegraded,
      /*
       * Prices are real either way. This says how fast they arrive — and
       * "connected" on a mute socket is the most reassuring lie the platform can
       * tell, so the Administration console is told the difference.
       */
      priceSource: this.streamDegraded ? "REST_POLL" : "WEBSOCKET",
      priceLatencyMs: this.streamDegraded ? POLL_INTERVAL_MS : null,
    };
  }

  /* ── Internals ───────────────────────────────────────────────────── */

  private adapterFor(exchange?: ExchangeId): IExchangeAdapter {
    const id = exchange ?? "BINANCE";
    const adapter = this.adapters.get(id);

    if (!adapter) {
      throw new Error(
        `${id} is not enabled. Enable it in market.config.ts — do not silently fall back to another venue, because a signal on the wrong exchange is a signal a trader cannot execute.`,
      );
    }

    return adapter;
  }

  /** For tests and the admin console. */
  adapterIds(): ExchangeId[] {
    return [...this.adapters.keys()];
  }

  /** Every exchange we hold an adapter for. */
  exchanges(): ExchangeId[] {
    return [...this.adapters.keys()];
  }

  /**
   * Round-trip an exchange and return the latency.
   *
   * Throws when it cannot be reached — the caller is the health worker, and a
   * ping that swallowed its own failure would report a dead exchange as a healthy
   * one with no latency, which is worse than not checking at all.
   */
  async ping(exchange: ExchangeId): Promise<number> {
    const adapter = this.adapters.get(exchange);

    if (!adapter) {
      throw new Error(`No adapter for ${exchange}`);
    }

    return adapter.ping();
  }

  isEnabled(exchange: ExchangeId): boolean {
    return EXCHANGES[exchange].enabled;
  }
}

/**
 * How often REST is polled when the stream is mute.
 *
 * Three seconds is a compromise with both sides stated. Faster burns the rate
 * budget the whole platform shares — and a ban does not slow one strategy down,
 * it blinds every strategy on the venue. Slower, and a trader is being shown a
 * price they cannot act on.
 */
const POLL_INTERVAL_MS = 3_000;
