
import { OnEvent } from "@nestjs/event-emitter";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";

/**
 * The in-app channel's wire to the browser.
 *
 * When the in-app channel delivers, it emits `notification.in-app`; this broadcasts
 * it to every connected client as a `notification` event. The Notifications page and
 * a global toast listen, and a Prime signal published becomes a toast in the
 * trader's browser the instant it happens — the notification engine demonstrated
 * end to end on the one channel that needs no external provider.
 *
 * It also emits a lightweight `notifications:changed` nudge so the Notifications
 * page refetches its history without polling — the same live pattern as the signals
 * feed.
 */
@WebSocketGateway({
  namespace: "notifications",
  cors: { origin: true, credentials: true },
})
export class NotificationGateway {

  @WebSocketServer()
  private server!: Server;

  @OnEvent("notification.in-app")
  onInApp(payload: {
    id: string;
    type: string;
    priority: string;
    title: string;
    body: string;
    link: string | null;
    at: number;
  }): void {
    if (!this.server) return;
    this.server.emit("notification", payload);
    this.server.emit("notifications:changed", { reason: "delivered" });
  }
}
