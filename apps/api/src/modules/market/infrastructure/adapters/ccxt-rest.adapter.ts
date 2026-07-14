import { Logger } from "@nestjs/common";
import * as ccxt from "ccxt";
import type {
  Candle,
  ExchangeId,
  FundingRate,
  OpenInterest,
  OrderBookSummary,
  Ticker,
  Timeframe,
} from "@aegis/contracts";
import type { ExchangeConfig } from "../../market.config";
import type {
  ExchangeCapabilities,
  ExchangeHealth,
  IExchangeAdapter,
  StreamSubscription,
} from "../../domain/exchange-adapter.interface";
import {
  ExchangeUnavailableError,
  UnsupportedStreamError,
} from "../../domain/exchange-adapter.interface";
import type { SymbolRegistry } from "../../domain/symbol-registry";
import type { MarketNormalizer } from "../normalizers/market.normalizer";
import type { LookupFunction } from "../exchange-dns";
import { CircuitBreaker } from "../circuit-breaker";
import { RateLimiter } from "../rate-limiter";

/**
 * The CCXT REST adapter — and the only place in this codebase that imports ccxt.
 *
 * **CCXT stops here.** Nothing above this file has heard of it, and that is
 * deliberate: exchanges are the least stable dependency the platform has, and
 * CCXT itself is a moving target that renames fields between minor versions. If
 * its shape leaked upward, a library upgrade would become a strategy bug.
 *
 * Every call goes through, in order:
 *
 *   1. THE CIRCUIT BREAKER — if this exchange is down, fail instantly rather
 *      than holding a worker hostage for a 15-second timeout.
 *   2. THE RATE LIMITER — wait rather than risk a ban. A ban does not degrade one
 *      strategy; it blinds every strategy on the venue while the platform keeps
 *      producing signals from candles that stopped updating.
 *   3. THE NORMALIZER — validate against the contract, and drop what fails. Never
 *      repair it. A repaired candle is a candle we invented.
 *
 * REST-only. Streams throw `UnsupportedStreamError` rather than silently doing
 * nothing — a subscription that quietly never fires is a strategy waiting forever
 * for data that will not come, with nothing in the logs to say so. Binance
 * overrides this with a real socket.
 */
export class CcxtRestAdapter implements IExchangeAdapter {
  protected readonly logger: Logger;
  protected readonly client: ccxt.Exchange;
  protected readonly breaker: CircuitBreaker;
  protected readonly limiter: RateLimiter;

  private connected = false;
  private connectedAt = 0;
  private lastLatencyMs: number | null = null;
  private lastHeartbeatAt: string | null = null;
  protected reconnectCount = 0;

  readonly id: ExchangeId;
  readonly capabilities: ExchangeCapabilities;

  constructor(
    protected readonly config: ExchangeConfig,
    protected readonly registry: SymbolRegistry,
    protected readonly normalizer: MarketNormalizer,
    protected readonly lookup?: LookupFunction,
  ) {
    this.id = config.id;
    this.logger = new Logger(`Exchange:${config.id}`);

    this.capabilities = {
      webSocket: config.hasWebSocket,
      derivatives: config.hasDerivatives,
      liquidations: config.hasLiquidations,
    };

    const ExchangeClass = (ccxt as unknown as Record<string, new (o: object) => ccxt.Exchange>)[
      config.ccxtId
    ];

    if (!ExchangeClass) {
      throw new Error(`ccxt has no exchange called "${config.ccxtId}"`);
    }

    this.client = new ExchangeClass({
      timeout: config.timeoutMs,
      enableRateLimit: true,
      // Perpetuals. Spot is fetched by overriding `type` per call where needed.
      options: { defaultType: "swap" },
    });

    if (lookup) this.installDnsLookup(lookup);

    this.breaker = new CircuitBreaker(config.id, {
      threshold: config.circuitBreakerThreshold,
      cooldownMs: 30_000,
      probeSuccesses: 1,
    });

    this.limiter = new RateLimiter(config.rateLimitPerMinute);
  }

  /* ── Lifecycle ───────────────────────────────────────────────────── */

  async connect(): Promise<void> {
    await this.guard(async () => {
      await this.client.loadMarkets();
    }, "loadMarkets");

    this.connected = true;
    this.connectedAt = Date.now();
    this.lastHeartbeatAt = new Date().toISOString();

    this.logger.log(
      { markets: Object.keys(this.client.markets ?? {}).length },
      "Connected",
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await this.client.close?.();
    this.logger.log("Disconnected");
  }

  async ping(): Promise<number> {
    const start = Date.now();
    await this.guard(() => this.client.fetchTime(), "ping");

    this.lastLatencyMs = Date.now() - start;
    this.lastHeartbeatAt = new Date().toISOString();
    return this.lastLatencyMs;
  }

  health(): ExchangeHealth {
    return {
      exchange: this.id,
      connected: this.connected && !this.breaker.isOpen,
      latencyMs: this.lastLatencyMs,
      uptimeSeconds: this.connectedAt
        ? Math.floor((Date.now() - this.connectedAt) / 1000)
        : 0,
      activeSubscriptions: this.activeSubscriptionCount(),
      reconnectCount: this.reconnectCount,
      lastHeartbeatAt: this.lastHeartbeatAt,
      errorRate: this.breaker.errorRate,
      circuitOpen: this.breaker.isOpen,
    };
  }

  /** Overridden by adapters that actually hold sockets. */
  protected activeSubscriptionCount(): number {
    return 0;
  }

  /* ── Historical ──────────────────────────────────────────────────── */

  async fetchCandles(input: {
    symbol: string;
    timeframe: Timeframe;
    limit: number;
    since?: number;
  }): Promise<{ candles: Candle[]; lastIsForming: boolean }> {
    const native = this.native(input.symbol);

    const rows = await this.guard(
      () =>
        this.client.fetchOHLCV(
          native,
          input.timeframe,
          input.since,
          input.limit,
        ),
      "fetchOHLCV",
    );

    const candles = this.normalizer.candles(this.id, rows as unknown[]);

    /*
     * IS THE LAST CANDLE STILL FORMING?
     *
     * This is the most consequential boolean in the market module. A strategy
     * that evaluates against an unclosed bar is committing look-ahead bias: the
     * bar can still reverse, so a rule that reads it will backtest beautifully
     * and lose money live.
     *
     * A candle is forming if its open time plus its duration is still in the
     * future. We do not trust the exchange to tell us — most do not.
     */
    const last = candles.at(-1);
    const lastIsForming = last
      ? last.time + timeframeMs(input.timeframe) > Date.now()
      : false;

    return { candles, lastIsForming };
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const native = this.native(symbol);

    const raw = await this.guard(
      () => this.client.fetchTicker(native),
      "fetchTicker",
    );

    const ticker = this.normalizer.ticker(
      this.id,
      this.pair(symbol),
      raw as unknown as Record<string, unknown>,
    );

    if (!ticker) {
      throw new ExchangeUnavailableError(
        this.id,
        `ticker for ${symbol} failed validation and was dropped`,
      );
    }

    return ticker;
  }

  async fetchTickers(symbols: string[]): Promise<Ticker[]> {
    const natives = symbols
      .map((s) => this.registry.toNative(this.id, { symbol: s, marketType: "PERPETUAL" }))
      .filter((n): n is string => n !== null);

    if (natives.length === 0) return [];

    const raw = await this.guard(
      () => this.client.fetchTickers(natives),
      "fetchTickers",
    );

    const out: Ticker[] = [];

    for (const [nativePair, value] of Object.entries(raw)) {
      // Back to canonical before it touches the contract. The exchange's spelling
      // dies here.
      const canonical = this.registry.canonicalise(nativePair);
      if (!canonical) continue;

      const ticker = this.normalizer.ticker(
        this.id,
        this.pair(canonical),
        value as unknown as Record<string, unknown>,
      );
      if (ticker) out.push(ticker);
    }

    return out;
  }

  async fetchOrderBook(symbol: string): Promise<OrderBookSummary> {
    const native = this.native(symbol);

    const raw = await this.guard(
      () => this.client.fetchOrderBook(native, 50),
      "fetchOrderBook",
    );

    const book = this.normalizer.orderBook(
      this.id,
      this.pair(symbol),
      raw as unknown as { bids: unknown[][]; asks: unknown[][]; timestamp?: number },
    );

    if (!book) {
      throw new ExchangeUnavailableError(
        this.id,
        `order book for ${symbol} failed validation and was dropped`,
      );
    }

    return book;
  }

  /**
   * Null when this exchange has no derivatives feed.
   *
   * Never a fabricated zero. A funding rate of 0 is a *claim* — "the market is
   * perfectly balanced" — and Crowd Squeeze would trade on it. Null says "we do
   * not know", and the strategy stands down. That difference is the whole reason
   * `capabilities` exists.
   */
  async fetchFundingRate(symbol: string): Promise<FundingRate | null> {
    if (!this.capabilities.derivatives) return null;

    const native = this.native(symbol);

    try {
      const raw = await this.guard(
        () => this.client.fetchFundingRate(native),
        "fetchFundingRate",
      );

      return this.normalizer.fundingRate(
        this.id,
        this.pair(symbol),
        raw as unknown as Record<string, unknown>,
      );
    } catch (error) {
      // A spot-only market has no funding. That is not an error worth alarming
      // about — it is the answer.
      this.logger.debug({ symbol, err: error }, "No funding rate available");
      return null;
    }
  }

  async fetchOpenInterest(symbol: string): Promise<OpenInterest | null> {
    if (!this.capabilities.derivatives) return null;

    const native = this.native(symbol);

    try {
      const raw = await this.guard(
        () => this.client.fetchOpenInterest(native),
        "fetchOpenInterest",
      );

      return this.normalizer.openInterest(
        this.id,
        this.pair(symbol),
        raw as unknown as Record<string, unknown>,
      );
    } catch (error) {
      this.logger.debug({ symbol, err: error }, "No open interest available");
      return null;
    }
  }

  /**
   * Every market this exchange lists, registered canonically.
   *
   * Nothing is assumed. If Binance does not list TON perpetuals, the registry
   * will not pretend it does — and no signal can be produced on a market that
   * does not exist. (The frontend mock made exactly that mistake and rendered
   * charts for symbols nobody trades.)
   */
  async fetchSymbols(): Promise<string[]> {
    await this.guard(() => this.client.loadMarkets(), "loadMarkets");

    const canonical: string[] = [];

    for (const market of Object.values(this.client.markets ?? {})) {
      if (!market?.active) continue;
      if (market.quote !== "USDT") continue;

      /*
       * Spot and perpetuals only.
       *
       * A dated future (BTC/USDT:USDT-240329) EXPIRES. Registering one as though
       * it were spot would hand a strategy a contract with a settlement date it
       * knows nothing about — and the position would be closed out by the
       * exchange, at its price, on a day nobody chose.
       */
      if (!market.spot && !market.swap) continue;

      /*
       * Canonicalise the PAIR, not the base.
       *
       * `market.base` is already "BTC" — and `canonicalise` takes a pair and
       * strips the quote off it, so a bare base matches no quote suffix and comes
       * back null. Passing it one silently discarded 4,495 of Binance's 4,498
       * markets; the three survivors were bases that happened to end in USD-ish
       * letters. No error, no warning — just a platform that had quietly never
       * heard of Bitcoin.
       */
      const symbol = this.registry.canonicalise(market.symbol ?? "");
      if (!symbol) continue;

      this.registry.register({
        exchange: this.id,
        canonical: symbol,
        marketType: market.swap ? "PERPETUAL" : "SPOT",
        nativeSymbol: market.symbol,
      });

      canonical.push(symbol);
    }

    return [...new Set(canonical)];
  }

  /* ── Streams — not here ──────────────────────────────────────────── */

  subscribe(subscription: StreamSubscription): Promise<void> {
    throw new UnsupportedStreamError(this.id, subscription.kind);
  }

  unsubscribe(subscription: StreamSubscription): Promise<void> {
    throw new UnsupportedStreamError(this.id, subscription.kind);
  }

  /* ── Internals ───────────────────────────────────────────────────── */

  /**
   * Resolve this exchange's hostnames through our own DNS server.
   *
   * Only used where the local network filters exchanges at the DNS layer (see
   * `exchange-dns.ts`). Unset in production, where this method never runs.
   *
   * ccxt builds an `undici.Agent` from `getDispatcherOptions()` the first time it
   * fetches, so we wrap that method to inject a `lookup` into the `connect`
   * block. Wrapping — rather than constructing an Agent ourselves — matters: the
   * Agent must come from *ccxt's* copy of undici, and ccxt's own keep-alive and
   * pooling tuning survives untouched. We add one key and change nothing else.
   */
  private installDnsLookup(lookup: LookupFunction): void {
    type DispatcherOptions = Record<string, unknown>;

    const client = this.client as unknown as {
      getDispatcherOptions?: (isPlainAgent?: boolean) => DispatcherOptions;
    };

    const original = client.getDispatcherOptions?.bind(client);

    if (!original) {
      // A ccxt upgrade renamed or removed it. Say so — silently falling back to
      // the blocked OS resolver would look exactly like an exchange outage.
      this.logger.error(
        "ccxt has no getDispatcherOptions() — the custom DNS resolver is NOT " +
          "installed, and exchange hostnames will use the OS resolver",
      );
      return;
    }

    client.getDispatcherOptions = (isPlainAgent = false): DispatcherOptions => {
      const options = original(isPlainAgent);

      // `Agent` takes TLS/socket settings under `connect`; `ProxyAgent` under
      // `requestTls`. ccxt tells us which shape it is building.
      const key = isPlainAgent ? "connect" : "requestTls";
      const existing = (options[key] as DispatcherOptions | undefined) ?? {};

      return { ...options, [key]: { ...existing, lookup } };
    };
  }

  /** Circuit breaker → rate limiter → the call. In that order, always. */
  protected async guard<T>(
    operation: () => Promise<T>,
    label: string,
  ): Promise<T> {
    return this.breaker.run(async () => {
      await this.limiter.acquire();

      try {
        const result = await operation();
        this.lastHeartbeatAt = new Date().toISOString();
        return result;
      } catch (error) {
        // Translate ccxt's exceptions into ours. Nothing above this file should
        // ever have to `instanceof ccxt.RateLimitExceeded`.
        if (error instanceof ccxt.RateLimitExceeded) {
          this.logger.warn({ label }, "Rate limited — backing off");
          throw new ExchangeUnavailableError(this.id, "rate limited");
        }

        if (
          error instanceof ccxt.ExchangeNotAvailable ||
          error instanceof ccxt.NetworkError
        ) {
          throw new ExchangeUnavailableError(
            this.id,
            error.message || "unreachable",
          );
        }

        throw error;
      }
    });
  }

  /**
   * The pair spelling the CONTRACT uses: "BTCUSDT".
   *
   * Not the exchange's. Binance says `BTC/USDT:USDT`, OKX says `BTC-USDT-SWAP`,
   * and `pairSchema` accepts neither — it is `/^[A-Z0-9]+$/`, deliberately, so
   * that an exchange's spelling cannot survive the trip out of this module. That
   * rule caught a real bug: every normalizer call here was being handed the
   * native symbol, and every ticker, order book and funding rate was rejected at
   * the boundary for a malformed pair.
   *
   * Every market we register is quoted in USDT (`fetchSymbols` filters on it), so
   * the quote is not a guess.
   */
  protected pair(symbol: string): string {
    return `${symbol}USDT`;
  }

  /** Canonical → this exchange's spelling. Throws if it does not list it. */
  protected native(symbol: string): string {
    const native = this.registry.toNative(this.id, {
      symbol,
      marketType: "PERPETUAL",
    });

    if (!native) {
      throw new ExchangeUnavailableError(
        this.id,
        `does not list ${symbol} — refusing to guess a symbol`,
      );
    }

    return native;
  }
}

/** Bar duration in ms. Used to tell a closed candle from a forming one. */
export function timeframeMs(timeframe: Timeframe): number {
  const table: Record<Timeframe, number> = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
  };
  return table[timeframe];
}
