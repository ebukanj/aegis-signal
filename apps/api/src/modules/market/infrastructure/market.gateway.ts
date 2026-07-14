import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { Ticker } from "@aegis/contracts";
import { AppConfigService } from "../../../config/app-config.service";

/**
 * Real prices, to the browser.
 *
 * This gateway is what **kills `use-live-price.ts`** — the frontend mock that
 * ticked a seeded random walk so the UI could be built (docs/MOCK_RETIREMENT.md).
 * From here on, the number on a signal card is a real Binance price, and the
 * "still at entry / chasing / missed" verdict is computed against something that
 * actually happened.
 *
 * Why this matters more than it sounds: a signal's entry goes stale the moment
 * it is published. If we said "enter near $145.30" and price is now $149, the
 * trade the signal described no longer exists — chasing it buys a worse
 * reward-to-risk than the one we promised. Without a live price the trader cannot
 * tell an actionable signal from a departed one, and "here is a trade worth taking
 * RIGHT NOW" is the entire product (AGENTS.md §1).
 *
 * The gateway broadcasts; it never decides. The frontend renders what arrives.
 */
@WebSocketGateway({
  namespace: "market",
  cors: { origin: true, credentials: true },
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MarketGateway.name);

  @WebSocketServer()
  private server!: Server;

  /** socket.id → the symbols it asked for. Empty set means "all of them". */
  private readonly interests = new Map<string, Set<string>>();

  constructor(private readonly config: AppConfigService) {
    void this.config;
  }

  handleConnection(client: Socket): void {
    this.interests.set(client.id, new Set());
    this.logger.debug({ client: client.id }, "Client connected");
  }

  handleDisconnect(client: Socket): void {
    this.interests.delete(client.id);
    this.logger.debug({ client: client.id }, "Client disconnected");
  }

  /**
   * A client says which symbols it cares about.
   *
   * Rooms rather than a broadcast to everyone: a trader watching five signals
   * should not receive ticks for two hundred pairs. On a phone that is bandwidth
   * they are paying for and a render loop they do not need.
   */
  @SubscribeMessage("watch")
  onWatch(client: Socket, symbols: unknown): void {
    if (!Array.isArray(symbols)) return;

    const wanted = symbols
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toUpperCase());

    // Leave what we no longer care about; join what we now do.
    const previous = this.interests.get(client.id) ?? new Set();
    for (const symbol of previous) {
      if (!wanted.includes(symbol)) void client.leave(room(symbol));
    }
    for (const symbol of wanted) {
      void client.join(room(symbol));
    }

    this.interests.set(client.id, new Set(wanted));
    this.logger.debug({ client: client.id, symbols: wanted.length }, "Watching");
  }

  /**
   * A real tick, from the exchange, to the browser.
   *
   * Fired by `MarketService` on every ticker update from the Binance socket.
   * Nothing is computed here — the price is what Binance said it was, validated
   * at the boundary by the normalizer and passed through unchanged.
   */
  @OnEvent("market.price")
  onPrice(payload: { symbol: string; ticker: Ticker }): void {
    if (!this.server) return;

    this.server.to(room(payload.symbol)).emit("price", {
      symbol: payload.symbol,
      price: payload.ticker.last,
      changePercent24h: payload.ticker.changePercent24h,
      at: payload.ticker.at,
    });
  }

  @OnEvent("exchange.disconnected")
  onExchangeDown(payload: { exchange: string; reason: string }): void {
    if (!this.server) return;

    /*
     * Tell the browser the feed is down.
     *
     * For most products a dropped connection is an inconvenience. For a trading
     * terminal it is a hazard: every price on screen was true when it loaded and
     * may be worthless now. The frontend already knows how to say so — it just
     * needs to be told.
     */
    this.server.emit("feed", {
      status: "down",
      exchange: payload.exchange,
      reason: payload.reason,
    });
  }

  @OnEvent("exchange.recovered")
  onExchangeUp(payload: { exchange: string }): void {
    if (!this.server) return;
    this.server.emit("feed", { status: "up", exchange: payload.exchange });
  }
}

const room = (symbol: string) => `sym:${symbol.toUpperCase()}`;
