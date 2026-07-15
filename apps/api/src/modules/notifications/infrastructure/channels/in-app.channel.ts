import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { NotificationChannel } from "@aegis/contracts";
import type { DeliveryResult, INotificationChannel } from "../../domain/channel";
import type { Notification } from "@aegis/contracts";

/**
 * In-app delivery — the one channel that is LIVE today.
 *
 * It needs no external provider, no secret, no third party: it emits an event the
 * notifications WebSocket gateway broadcasts to the browser. That makes it the
 * channel the platform can always deliver on, and the one the whole engine is
 * demonstrated against end to end — a Prime signal published becomes a toast in the
 * trader's browser without anyone touching a page.
 *
 * It always succeeds from the engine's point of view (the message reached the
 * broadcast), which is honest: whether a browser is currently connected to receive
 * it is a client concern, and the notification is stored regardless so it is there
 * when the page next loads.
 */
@Injectable()
export class InAppChannel implements INotificationChannel {
  readonly channel: NotificationChannel = "IN_APP";

  constructor(private readonly events: EventEmitter2) {}

  isConfigured(): boolean {
    return true; // always available — no external dependency
  }

  async health(): Promise<{ status: "AVAILABLE"; error: null }> {
    return { status: "AVAILABLE", error: null };
  }

  async send(notification: Notification): Promise<DeliveryResult> {
    this.events.emit("notification.in-app", {
      id: notification.id,
      type: notification.type,
      priority: notification.priority,
      title: notification.message.title,
      body: notification.message.plain,
      link: notification.message.link,
      at: Date.now(),
    });
    return { ok: true, providerResponse: "broadcast" };
  }
}
