import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";
import { EVENT } from "@aegis/contracts";

/**
 * The feed, made LIVE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SIGNAL FEED THAT ONLY CHANGES ON REFRESH IS STALE INTELLIGENCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The owner's requirement, exactly: a missed or stopped signal must leave the feed
 * on its own, and a stronger signal must rise, without anyone reloading the page.
 * The whole product is "here is a trade worth taking RIGHT NOW" — a feed that is
 * only correct at page-load is a feed that is usually wrong.
 *
 * This gateway is the wire. When a signal is published, or the Settlement Worker
 * settles one (a target hit, a stop hit, a setup missed), it broadcasts a tiny
 * `signals:changed` event. The browser holds a live query and refetches on that
 * event — re-ranking the list and dropping what has settled. No polling (which
 * would be constant load for mostly-nothing), no manual refresh.
 *
 * It broadcasts a nudge, not the data: "something changed, come and look." The feed
 * is small and the read is cheap, and a nudge cannot get out of sync with the
 * source of truth the way a pushed payload can.
 */
@WebSocketGateway({
  namespace: "signals",
  cors: { origin: true, credentials: true },
})
export class SignalGateway {
  private readonly logger = new Logger(SignalGateway.name);

  @WebSocketServer()
  private server!: Server;

  @OnEvent("signals.changed")
  onSettled(payload: { settled: number }): void {
    if (!this.server) return;
    this.server.emit("signals:changed", { reason: "settled", count: payload.settled });
    this.logger.debug(`Broadcast signals:changed (settled ${payload.settled})`);
  }

  @OnEvent(EVENT.SIGNAL_PUBLISHED)
  onPublished(): void {
    if (!this.server) return;
    this.server.emit("signals:changed", { reason: "published" });
  }
}
