import type {
  Candle,
  ExchangeId,
  FundingRate,
  Liquidation,
  OpenInterest,
  OrderBookSummary,
  Ticker,
  Timeframe,
} from "@aegis/contracts";

/**
 * The exchange abstraction.
 *
 * **This interface is the wall.** Everything above it — indicators, strategies,
 * risk, signals — speaks canonical contract types and has never heard of CCXT,
 * of `fstream.binance.com`, or of the fact that OKX calls a perpetual
 * `BTC-USDT-SWAP`.
 *
 * That is not tidiness. Exchanges are the least stable dependency this platform
 * has: they rename fields, change rate limits, get delisted, and go down. If
 * CCXT's shape leaked into the Strategy Engine, a Binance API change would
 * become a strategy bug. Behind this wall, it is an adapter bug — one file,
 * one test, one fix (Philosophy 19: every external integration is abstracted).
 *
 * An adapter that cannot do something says so through `capabilities`. It never
 * returns a plausible-looking zero. `hasDerivatives: false` means *we cannot see
 * funding* — and a strategy that needs funding must stand down, not guess.
 */
export interface ExchangeCapabilities {
  webSocket: boolean;
  derivatives: boolean;
  liquidations: boolean;
}

export interface ExchangeHealth {
  exchange: ExchangeId;
  connected: boolean;
  /** Round-trip to the exchange, ms. */
  latencyMs: number | null;
  /** Seconds since the connection was established. */
  uptimeSeconds: number;
  activeSubscriptions: number;
  reconnectCount: number;
  lastHeartbeatAt: string | null;
  /** Failed requests as a share of the last 100. */
  errorRate: number;
  /** True when the circuit breaker has cut this exchange off. */
  circuitOpen: boolean;
}

/** A live stream a caller can subscribe to. */
export type StreamKind =
  | "candle"
  | "ticker"
  | "trade"
  | "book"
  | "funding"
  | "openInterest"
  | "liquidation";

export interface StreamSubscription {
  kind: StreamKind;
  /** Canonical symbol — "BTC", never "BTCUSDT" or "BTC-USDT-SWAP". */
  symbol: string;
  timeframe?: Timeframe;
}

/**
 * Every exchange implements this, and adapters are interchangeable.
 *
 * A `null` return means *we cannot see it*, not *it is zero*. The distinction is
 * the whole reason this interface exists: a funding rate of 0 says "the market is
 * balanced", and a funding rate of null says "we do not know". Confusing them
 * would let a strategy trade on a fact nobody established.
 */
export interface IExchangeAdapter {
  readonly id: ExchangeId;
  readonly capabilities: ExchangeCapabilities;

  /* ── Lifecycle ───────────────────────────────────────────────────── */

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Round-trip latency in ms. Throws if unreachable. */
  ping(): Promise<number>;
  health(): ExchangeHealth;

  /* ── Historical (REST) ───────────────────────────────────────────── */

  /**
   * Candles, oldest → newest.
   *
   * **The last candle may still be forming.** The caller is told which, and a
   * strategy must never evaluate against a forming bar: it can still reverse,
   * and a rule that reads it is committing look-ahead bias — the single easiest
   * way to build something that backtests beautifully and loses money live.
   */
  fetchCandles(input: {
    symbol: string;
    timeframe: Timeframe;
    limit: number;
    /** Unix ms. Omit for the most recent `limit` bars. */
    since?: number;
  }): Promise<{ candles: Candle[]; lastIsForming: boolean }>;

  fetchTicker(symbol: string): Promise<Ticker>;
  fetchTickers(symbols: string[]): Promise<Ticker[]>;
  fetchOrderBook(symbol: string): Promise<OrderBookSummary>;

  /** Null when this exchange has no derivatives feed. Never a fabricated zero. */
  fetchFundingRate(symbol: string): Promise<FundingRate | null>;
  fetchOpenInterest(symbol: string): Promise<OpenInterest | null>;

  /** The markets this exchange actually lists. Used by the Symbol Registry. */
  fetchSymbols(): Promise<string[]>;

  /* ── Live (WebSocket) ────────────────────────────────────────────── */

  /**
   * Subscribe to a live stream.
   *
   * Adapters without a socket throw `UnsupportedStreamError` rather than
   * silently doing nothing — a subscription that quietly never fires is a
   * strategy waiting forever for data that will not come, and nothing in the
   * logs to say so.
   */
  subscribe(subscription: StreamSubscription): Promise<void>;
  unsubscribe(subscription: StreamSubscription): Promise<void>;
}

/** Streams a REST-only adapter cannot serve. */
export class UnsupportedStreamError extends Error {
  constructor(exchange: ExchangeId, kind: StreamKind) {
    super(
      `${exchange} has no ${kind} stream. Poll it, or use an exchange that does — do not wait for data that will never arrive.`,
    );
    this.name = "UnsupportedStreamError";
  }
}

/** The exchange is up but refused us — rate limit, ban, maintenance. */
export class ExchangeUnavailableError extends Error {
  constructor(
    readonly exchange: ExchangeId,
    message: string,
  ) {
    super(`${exchange}: ${message}`);
    this.name = "ExchangeUnavailableError";
  }
}

/** Live payloads the adapters emit. Consumed by the publisher, never directly. */
export interface AdapterEvents {
  candle: { exchange: ExchangeId; symbol: string; timeframe: Timeframe; candle: Candle; closed: boolean };
  ticker: { exchange: ExchangeId; symbol: string; ticker: Ticker };
  funding: { exchange: ExchangeId; symbol: string; funding: FundingRate };
  openInterest: { exchange: ExchangeId; symbol: string; openInterest: OpenInterest };
  liquidation: { exchange: ExchangeId; symbol: string; liquidation: Liquidation };
  connected: { exchange: ExchangeId };
  disconnected: { exchange: ExchangeId; reason: string };
  reconnected: { exchange: ExchangeId; afterMs: number; attempts: number };
}
