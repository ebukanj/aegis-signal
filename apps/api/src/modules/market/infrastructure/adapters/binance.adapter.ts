import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { Candle, Timeframe } from "@aegis/contracts";
import type { ExchangeConfig } from "../../market.config";
import type { StreamSubscription } from "../../domain/exchange-adapter.interface";
import type { SymbolRegistry } from "../../domain/symbol-registry";
import type { MarketNormalizer } from "../normalizers/market.normalizer";
import type { LookupFunction } from "../exchange-dns";
import { CcxtRestAdapter, timeframeMs } from "./ccxt-rest.adapter";

/**
 * Binance — REST via CCXT, live data via a native WebSocket.
 *
 * We do not have a CCXT Pro licence, so the socket is hand-written. That is fine,
 * and it lives *behind* `IExchangeAdapter` — if a licence is ever bought, this
 * file changes and nothing else in the platform does. That is the entire purpose
 * of the abstraction (Philosophy 19).
 *
 * THE HARD PART IS NOT CONNECTING. It is noticing that you have *stopped* being
 * connected.
 *
 * A TCP socket can stay open indefinitely while the far end has silently stopped
 * sending. Nothing errors. Nothing closes. The application keeps reading its last
 * known price, the scanner keeps scanning it, and the platform keeps producing
 * signals from a market that has not moved in twenty minutes — while the real
 * market moved 4%.
 *
 * **A dead socket that looks alive is the worst failure this module can have**,
 * because every downstream number stays plausible. So: a heartbeat watchdog. If
 * no message arrives within the interval, we assume it is dead and tear it down —
 * even though nothing told us to.
 */
export class BinanceAdapter extends CcxtRestAdapter {
  private socket: WebSocket | null = null;
  private readonly subscriptions = new Set<string>();

  /**
   * Emits `candle`, `ticker`, `liquidation`, `connected`, `disconnected`,
   * `reconnected`, and — when the socket is open but mute — `degraded` / `live`.
   */
  readonly stream = new EventEmitter();

  private heartbeat: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private reconnectAttempt = 0;
  private closingIntentionally = false;

  /*
   * ── The mute socket ──
   *
   * A subscription ACK is not market data. Binance answers `{"result":null}` to a
   * SUBSCRIBE and then, on a restricted network, sends nothing ever again — the
   * socket is open, the handshake succeeded, the exchange agreed to our streams,
   * and not one price arrives.
   *
   * Counting *messages* cannot see this: the ACK is a message. So we count DATA
   * frames, separately, and reset the count on every open. A connection that has
   * opened and delivered zero data frames before falling silent is not a
   * connection — it is a socket-shaped hole, and the platform must be told to get
   * its prices somewhere else.
   */
  private dataFrames = 0;
  private muteOpens = 0;
  private degraded = false;

  /** Two mute connections is a pattern. One is a bad minute. */
  private static readonly MUTE_OPENS_BEFORE_DEGRADED = 2;

  constructor(
    config: ExchangeConfig,
    registry: SymbolRegistry,
    normalizer: MarketNormalizer,
    lookup?: LookupFunction,
  ) {
    super(config, registry, normalizer, lookup);
  }

  /* ── Lifecycle ───────────────────────────────────────────────────── */

  override async connect(): Promise<void> {
    await super.connect();
    this.openSocket();
  }

  override async disconnect(): Promise<void> {
    this.closingIntentionally = true;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    await super.disconnect();
  }

  protected override activeSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /* ── Candles, with the half of volume that OHLCV throws away ─────── */

  /**
   * Binance's RAW kline endpoint, not ccxt's `fetchOHLCV`.
   *
   * `fetchOHLCV` returns six columns and drops the rest. One of the columns it
   * drops is `takerBuyBaseAssetVolume` — the volume that was BUYERS crossing the
   * spread — and without it Cumulative Volume Delta cannot be computed at all.
   * Not computed badly: not computed. CVD is how a strategy tells forced selling
   * (liquidations hitting bids) from conviction selling (holders leaving), and
   * Support Reclaim reads it.
   *
   * So we call the endpoint ccxt is wrapping, and keep column 9. Everything else
   * — the breaker, the limiter, the normalizer — is unchanged, because this is
   * still a REST call to Binance and it must obey the same rules as every other.
   *
   * Bybit's adapter does not override this, gets six columns, and reports `null`.
   * That is the correct answer for an exchange that does not publish it.
   */
  override async fetchCandles(input: {
    symbol: string;
    timeframe: Timeframe;
    limit: number;
    since?: number;
  }): Promise<{ candles: Candle[]; lastIsForming: boolean }> {
    const native = this.native(input.symbol);

    // The raw endpoint speaks Binance's own symbol ("BTCUSDT"), not ccxt's
    // unified spelling ("BTC/USDT:USDT").
    const market = this.client.market(native);

    const rows = await this.guard(
      () =>
        (
          this.client as unknown as {
            fapiPublicGetKlines: (p: object) => Promise<unknown[]>;
          }
        ).fapiPublicGetKlines({
          symbol: market.id,
          interval: input.timeframe,
          limit: input.limit,
          ...(input.since ? { startTime: input.since } : {}),
        }),
      "fapiPublicGetKlines",
    );

    /*
     * Binance's kline row is twelve columns. We take seven:
     *
     *   [0] open time   [1] open   [2] high   [3] low   [4] close   [5] volume
     *   [9] taker buy base volume
     *
     * The normalizer validates them exactly as it validates everything else — a
     * row from a raw endpoint gets no more trust than a row from ccxt.
     */
    const normalized = this.normalizer.candles(
      this.id,
      (rows as unknown[][]).map((row) => [
        row[0],
        row[1],
        row[2],
        row[3],
        row[4],
        row[5],
        row[9],
      ]),
    );

    const last = normalized.at(-1);
    const lastIsForming = last
      ? last.time + timeframeMs(input.timeframe) > Date.now()
      : false;

    return { candles: normalized, lastIsForming };
  }

  /**
   * Is the socket delivering, or merely connected?
   *
   * The Administration console needs the difference. "Connected" on a mute socket
   * is the most reassuring lie the platform can tell.
   */
  get streamDegraded(): boolean {
    return this.degraded;
  }

  /* ── Subscriptions ───────────────────────────────────────────────── */

  override async subscribe(subscription: StreamSubscription): Promise<void> {
    const stream = this.streamName(subscription);
    if (!stream || this.subscriptions.has(stream)) return;

    this.subscriptions.add(stream);
    this.send({ method: "SUBSCRIBE", params: [stream], id: Date.now() });

    this.logger.log({ stream }, "Subscribed");
  }

  override async unsubscribe(subscription: StreamSubscription): Promise<void> {
    const stream = this.streamName(subscription);
    if (!stream || !this.subscriptions.has(stream)) return;

    this.subscriptions.delete(stream);
    this.send({ method: "UNSUBSCRIBE", params: [stream], id: Date.now() });
  }

  /** Canonical → Binance's stream name. "BTC" + candle 1h → "btcusdt@kline_1h". */
  private streamName(subscription: StreamSubscription): string | null {
    const native = this.registry
      .toNative(this.id, {
        symbol: subscription.symbol,
        marketType: "PERPETUAL",
      })
      ?.replace("/", "")
      .replace(":USDT", "")
      .toLowerCase();

    if (!native) return null;

    switch (subscription.kind) {
      case "candle":
        return subscription.timeframe
          ? `${native}@kline_${subscription.timeframe}`
          : null;
      case "ticker":
        return `${native}@ticker`;
      case "trade":
        return `${native}@aggTrade`;
      case "liquidation":
        return `${native}@forceOrder`;
      default:
        // Funding and open interest are not streamed usefully by Binance; they
        // are polled. Returning null is honest — throwing would suggest the
        // caller made a mistake, and they did not.
        return null;
    }
  }

  /* ── The socket ──────────────────────────────────────────────────── */

  private openSocket(): void {
    const url = this.config.wsUrl;
    if (!url) return;

    this.closingIntentionally = false;

    // `lookup` is undefined in production — `ws` then uses the OS resolver, which
    // is exactly what we want. It is set only where the network filters exchanges.
    this.socket = new WebSocket(url, { lookup: this.lookup });

    this.socket.on("open", () => {
      const afterMs = this.reconnectAttempt > 0 ? this.backoffMs() : 0;

      this.logger.log(
        { attempts: this.reconnectAttempt },
        this.reconnectAttempt > 0 ? "WebSocket reconnected" : "WebSocket open",
      );

      if (this.reconnectAttempt > 0) {
        this.reconnectCount++;
        this.stream.emit("reconnected", {
          exchange: this.id,
          afterMs,
          attempts: this.reconnectAttempt,
        });
      }

      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();

      // Every connection proves itself from scratch. The last one's data frames
      // say nothing about this one.
      this.dataFrames = 0;

      this.startHeartbeat();

      // Re-subscribe to everything. A reconnect that forgets its subscriptions
      // is a socket that is open and useless — and it looks perfectly healthy.
      if (this.subscriptions.size > 0) {
        this.send({
          method: "SUBSCRIBE",
          params: [...this.subscriptions],
          id: Date.now(),
        });
        this.logger.log(
          { streams: this.subscriptions.size },
          "Re-subscribed after reconnect",
        );
      }

      this.stream.emit("connected", { exchange: this.id });
    });

    this.socket.on("message", (raw: WebSocket.RawData) => {
      this.lastMessageAt = Date.now();
      this.handle(raw);
    });

    this.socket.on("close", (code: number) => {
      this.stopHeartbeat();

      if (this.closingIntentionally) return;

      this.logger.warn({ code }, "WebSocket closed — reconnecting");
      this.stream.emit("disconnected", {
        exchange: this.id,
        reason: `closed (${code})`,
      });

      this.scheduleReconnect();
    });

    this.socket.on("error", (error: Error) => {
      // Never rethrow. An unhandled socket error takes the whole process down
      // over an exchange having a bad minute.
      this.logger.error({ err: error }, "WebSocket error");
    });
  }

  /**
   * The watchdog.
   *
   * A socket can stay open while the far end has silently stopped sending. This
   * is the only thing that notices. Without it, the platform reads a frozen price
   * forever and every downstream number stays plausible.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeat = setInterval(() => {
      const silentFor = Date.now() - this.lastMessageAt;
      if (silentFor <= this.config.heartbeatMs) return;

      /*
       * Silent — but WHY silent decides what we do about it.
       *
       * A socket that delivered data and then stopped is a dropped connection:
       * reconnect, and it comes back. A socket that opened, was acknowledged, and
       * delivered NOTHING is a socket the network is holding shut. Reconnecting
       * that one just repeats the same handshake forever, and the platform sits
       * there looking connected with a price that never moves.
       */
      if (this.dataFrames === 0) {
        this.muteOpens++;

        this.logger.error(
          { silentForMs: silentFor, muteOpens: this.muteOpens },
          "WebSocket opened, was acknowledged, and delivered NO data — the feed is mute",
        );

        if (
          this.muteOpens >= BinanceAdapter.MUTE_OPENS_BEFORE_DEGRADED &&
          !this.degraded
        ) {
          this.degraded = true;

          // Not a warning. The platform's live price just died, and downstream
          // must switch to REST or trade on a number that stopped being true.
          this.logger.error(
            "WebSocket is mute after repeated attempts — falling back to REST polling",
          );
          this.stream.emit("degraded", {
            exchange: this.id,
            reason: "the WebSocket opens and is acknowledged but delivers no data",
          });
        }
      } else {
        this.logger.error(
          { silentForMs: silentFor },
          "WebSocket has gone silent — assuming it is dead and reconnecting",
        );
      }

      // Terminate, do not close. `close()` waits politely for a handshake the
      // dead end will never complete.
      this.socket?.terminate();
    }, this.config.heartbeatMs / 2);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt++;
    const delay = this.backoffMs();

    this.logger.log(
      { attempt: this.reconnectAttempt, delayMs: delay },
      "Reconnecting",
    );

    setTimeout(() => this.openSocket(), delay);
  }

  /** Exponential, jittered, capped. Jitter stops a herd of workers stampeding. */
  private backoffMs(): number {
    const base = Math.min(1_000 * 2 ** (this.reconnectAttempt - 1), 30_000);
    return base / 2 + Math.random() * (base / 2);
  }

  private send(payload: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  /* ── Message handling ────────────────────────────────────────────── */

  private handle(raw: WebSocket.RawData): void {
    let message: { stream?: string; data?: Record<string, unknown> };

    try {
      message = JSON.parse(raw.toString()) as typeof message;
    } catch {
      this.logger.warn("Unparseable WebSocket frame — dropped");
      return;
    }

    const { stream, data } = message;

    // Not a data frame — a SUBSCRIBE acknowledgement, or a pong. It proves the
    // socket is open. It proves nothing whatsoever about prices arriving.
    if (!stream || !data) return;

    this.dataFrames++;

    /*
     * Real data, after we had given up on this socket. The exchange is talking
     * again — tell the service so it can stop polling REST and go back to
     * sub-second ticks.
     */
    if (this.degraded) {
      this.degraded = false;
      this.muteOpens = 0;
      this.logger.log("WebSocket is delivering data again — leaving REST fallback");
      this.stream.emit("live", { exchange: this.id });
    }

    if (stream.includes("@kline")) return this.onCandle(data);
    if (stream.includes("@ticker")) return this.onTicker(data);
    if (stream.includes("@forceOrder")) return this.onLiquidation(data);
  }

  private onCandle(data: Record<string, unknown>): void {
    const k = data.k as Record<string, unknown> | undefined;
    if (!k) return;

    // `V` (capital) is taker-buy base volume; `v` (lower) is total volume. They
    // differ by one letter and by the entire meaning of CVD — mixing them up would
    // make every bar look like it was 100% aggressive buying.
    const candle = this.normalizer.candle(this.id, [
      k.t,
      k.o,
      k.h,
      k.l,
      k.c,
      k.v,
      k.V,
    ]);

    if (!candle) return;

    const symbol = this.registry.canonicalise(String(data.s ?? ""));
    if (!symbol) return;

    /*
     * `x` is Binance's "this candle is closed" flag.
     *
     * It is passed straight through as `closed`, and downstream ONLY evaluates
     * strategies on closed candles. Acting on a forming bar is look-ahead bias:
     * the bar can still reverse, and the trade was taken on information that did
     * not exist yet.
     */
    this.stream.emit("candle", {
      exchange: this.id,
      symbol,
      timeframe: String(k.i) as Timeframe,
      candle,
      closed: Boolean(k.x),
    });
  }

  private onTicker(data: Record<string, unknown>): void {
    const pair = String(data.s ?? "");
    const symbol = this.registry.canonicalise(pair);
    if (!symbol) return;

    const ticker = this.normalizer.ticker(this.id, pair, {
      last: data.c,
      bid: data.b,
      ask: data.a,
      quoteVolume: data.q,
      percentage: data.P,
      timestamp: data.E,
    });

    if (ticker) {
      this.stream.emit("ticker", { exchange: this.id, symbol, ticker });
    }
  }

  /**
   * A forced liquidation.
   *
   * This is the mechanical edge the Reversal strategy reads: price falling
   * because sellers *want* out is a trend, while price falling because the
   * exchange is *closing people out* is an air-pocket that tends to snap back.
   * Liquidation engines do not have opinions.
   */
  private onLiquidation(data: Record<string, unknown>): void {
    const o = data.o as Record<string, unknown> | undefined;
    if (!o) return;

    const pair = String(o.s ?? "");
    const symbol = this.registry.canonicalise(pair);
    if (!symbol) return;

    const price = Number(o.ap ?? o.p);
    const quantity = Number(o.q);

    if (!Number.isFinite(price) || !Number.isFinite(quantity)) return;

    this.stream.emit("liquidation", {
      exchange: this.id,
      symbol,
      liquidation: {
        exchange: this.id,
        pair,
        // Binance reports the side of the *closing order*. A SELL order closes a
        // long — so a SELL is a LONG being liquidated. Getting this backwards
        // inverts the entire signal.
        side: o.S === "SELL" ? "LONG" : "SHORT",
        notionalUsd: price * quantity,
        price,
        at: new Date(Number(data.E ?? Date.now())).toISOString(),
      },
    });
  }
}
