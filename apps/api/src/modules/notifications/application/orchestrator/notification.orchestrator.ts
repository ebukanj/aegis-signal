import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  type DeliveryStatus,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationType,
  type RenderedMessage,
} from "@aegis/contracts";

import { ChannelRegistry } from "../channels/channel.registry";
import { PreferenceResolver } from "../preferences/preference.resolver";
import { RetryPolicy } from "../retry/retry.policy";
import { NotificationRepository } from "../../infrastructure/repository/notification.repository";

/** What the router hands the orchestrator: a rendered event, ready to route. */
export interface DispatchRequest {
  type: NotificationType;
  priority: NotificationPriority;
  message: RenderedMessage;
  /**
   * A key UNIQUE to this event (a signal id, a risk-flag id). It anchors the
   * deterministic delivery id, so re-processing the SAME event delivers nothing
   * twice — while a different event (a new signal next week) gets a distinct id and
   * is delivered normally.
   */
  dedupeKey: string;
  /** The coin this concerns — for the time-window dedup, filtering and display. */
  subject: string | null;
  /** For the strategy/confidence preference gates. */
  strategyId?: string | null;
  confidence?: number | null;
  recipient?: string;
  /**
   * Restrict this dispatch to these channels (intersected with what the recipient
   * has enabled). Used by the per-user Telegram fan-out, which must NOT also fire
   * in-app — the in-app feed is already carried by the broadcast dispatch.
   */
  onlyChannels?: NotificationChannel[];
}

/**
 * The pipeline — route → resolve preferences → dedupe → deliver → track.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT DELIVERS. IT DECIDES NOTHING.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * By the time an event reaches here, every decision is made — the signal exists,
 * the risk is judged, the confidence is scored. The orchestrator's whole job is the
 * "who / which channel / when", and it does it with three guarantees:
 *
 *   EXACTLY ONCE — a deterministic delivery id per (subject, type, channel,
 *   recipient) plus a dedup window means a re-processed event delivers nothing
 *   twice, enforced at the database.
 *
 *   HONOUR THE RECIPIENT — the preference resolver can only ever remove a delivery;
 *   a suppressed notification is recorded (so it is auditable) but not sent.
 *
 *   LOSE A PROVIDER, NOT A NOTIFICATION — channels are independent; one being down
 *   or unconfigured is skipped, never fatal, and the others carry on.
 */
@Injectable()
export class NotificationOrchestrator {
  private readonly logger = new Logger(NotificationOrchestrator.name);

  /** Dedup window: the same notification to the same channel inside this is one. */
  private static readonly DEDUPE_WINDOW_MS = 10 * 60 * 1000;

  private readonly counts = new Map<NotificationChannel, { sent: number; failed: number; lastError: string | null }>();

  constructor(
    private readonly channels: ChannelRegistry,
    private readonly preferences: PreferenceResolver,
    private readonly retry: RetryPolicy,
    private readonly repository: NotificationRepository,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Dispatch one event to every channel the recipient wants, deduplicated and
   * tracked. Returns the delivery ids created (empty when fully suppressed).
   */
  async dispatch(request: DispatchRequest, now = Date.now()): Promise<string[]> {
    const recipient = request.recipient ?? "default";
    const prefs = this.preferences.preferencesFor(recipient);

    const resolved = this.preferences.resolve({
      prefs,
      priority: request.priority,
      coin: request.subject,
      strategyId: request.strategyId ?? null,
      confidence: request.confidence ?? null,
      now,
    });

    /* Narrow to the requested channels, if the caller asked for a subset. */
    if (request.onlyChannels) {
      resolved.channels = resolved.channels.filter((c) => request.onlyChannels!.includes(c));
    }

    /* Fully suppressed — record ONE suppressed row (so a trader can see it was held
     * and why) and stop. */
    if (resolved.channels.length === 0) {
      await this.record(request, recipient, "IN_APP", "SUPPRESSED", now, resolved.suppressedReason);
      return [];
    }

    const ids: string[] = [];

    for (const channel of resolved.channels) {
      const id = deliveryId(recipient, request.type, request.dedupeKey, channel);

      /* Deduplication — an equivalent notification already went out recently. */
      const dupe = await this.repository.recentDuplicate({
        recipient,
        type: request.type,
        subject: request.subject,
        channel,
        since: now - NotificationOrchestrator.DEDUPE_WINDOW_MS,
      });
      if (dupe) {
        this.logger.debug(`Deduplicated ${request.type} for ${request.subject} on ${channel}`);
        continue;
      }

      const { created } = await this.record(request, recipient, channel, "QUEUED", now, null, id);
      if (!created) continue; // exactly-once: this delivery already exists

      ids.push(id);
      /* Deliver now. Scheduling/quiet-hours-hold could defer this; for the live
       * in-app channel, immediate is correct. */
      await this.deliver(id, channel, request, 0);
    }

    return ids;
  }

  /* ── Delivery with bounded, backed-off retries ─────────────────── */

  private async deliver(
    id: string,
    channelName: NotificationChannel,
    request: DispatchRequest,
    attempt: number,
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) return;

    /* An unconfigured channel is SKIPPED, not failed — cancel this delivery cleanly
     * so it does not sit QUEUED forever or pollute the failure stats. */
    if (!channel.isConfigured()) {
      await this.transition(id, "CANCELLED", { providerResponse: `${channelName} not configured` });
      return;
    }

    await this.transition(id, "SENDING", { attempts: attempt + 1 });
    this.events.emit("notification.sending", { id, channel: channelName });

    let result;
    try {
      const notification = await this.repository.byId(id);
      if (!notification) return;
      result = await channel.send(notification);
    } catch (error) {
      /* An unexpected throw is treated as a retryable failure — the bug might be
       * transient, and the retry cap stops an infinite loop. */
      result = { ok: false as const, retryable: true, error: (error as Error).message };
    }

    if (result.ok) {
      await this.transition(id, "DELIVERED", { providerResponse: result.providerResponse, deliveredAt: Date.now() });
      this.bump(channelName, "sent", null);
      this.events.emit("notification.delivered", { id, channel: channelName });
      return;
    }

    /* A failure. Retry only if the channel said it was transient and we have
     * attempts left; otherwise it is the dead letter. */
    if (this.retry.shouldRetry(attempt + 1, result.retryable)) {
      await this.transition(id, "RETRYING", { providerResponse: result.error });
      this.events.emit("notification.retried", { id, channel: channelName, attempt: attempt + 1 });
      const delay = this.retry.delayMs(attempt + 1);
      setTimeout(() => void this.deliver(id, channelName, request, attempt + 1), delay).unref?.();
      return;
    }

    await this.transition(id, "FAILED", { providerResponse: result.error });
    this.bump(channelName, "failed", result.error);
    this.events.emit("notification.failed", { id, channel: channelName, error: result.error });
  }

  /* ── Persistence + tracking ────────────────────────────────────── */

  private async record(
    request: DispatchRequest,
    recipient: string,
    channel: NotificationChannel,
    status: DeliveryStatus,
    now: number,
    suppressedReason: string | null,
    id = deliveryId(recipient, request.type, request.dedupeKey, channel),
  ): Promise<{ created: boolean }> {
    const result = await this.repository.create({
      id,
      type: request.type,
      priority: request.priority,
      channel,
      recipient,
      subject: request.subject,
      message: request.message,
      status,
      attempts: 0,
      providerResponse: suppressedReason,
      createdAt: now,
      scheduledFor: now,
      deliveredAt: null,
    });

    if (result.created && status === "QUEUED") {
      this.events.emit("notification.queued", { id, channel, type: request.type });
    }
    return result;
  }

  private async transition(
    id: string,
    status: DeliveryStatus,
    patch: { attempts?: number; providerResponse?: string | null; deliveredAt?: number | null } = {},
  ): Promise<void> {
    await this.repository.updateStatus(id, status, patch);
  }

  private bump(channel: NotificationChannel, field: "sent" | "failed", error: string | null): void {
    const c = this.counts.get(channel) ?? { sent: 0, failed: 0, lastError: null };
    c[field] += 1;
    if (error) c.lastError = error;
    this.counts.set(channel, c);
  }

  countsFor(channel: NotificationChannel): { sent: number; failed: number; lastError: string | null } {
    return this.counts.get(channel) ?? { sent: 0, failed: 0, lastError: null };
  }
}

/**
 * The deterministic delivery id — the mechanism behind "exactly once". The same
 * (recipient, type, EVENT KEY, channel) always hashes to the same id, so a
 * re-processed event maps to a row that already exists and the create is refused.
 * The event key is unique per event (a signal id), so distinct events never
 * collide.
 */
export function deliveryId(
  recipient: string,
  type: string,
  eventKey: string,
  channel: string,
): string {
  return `ntf:${fnv(`${recipient}|${type}|${eventKey}|${channel}`)}`;
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
