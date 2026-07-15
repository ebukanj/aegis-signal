import type { Notification, NotificationChannel } from "@aegis/contracts";

/** The outcome of one delivery attempt. */
export type DeliveryResult =
  | { ok: true; providerResponse: string }
  | { ok: false; retryable: boolean; error: string };

/**
 * A delivery channel — Telegram, email, the in-app socket, a webhook.
 *
 * ── Every provider hides behind this, and nothing leaks past it ──
 *
 * The orchestrator knows only this interface. It never imports a provider SDK,
 * never learns what a Telegram bot token looks like, never handles an SMTP
 * response. That isolation is what makes the platform provider-agnostic: adding a
 * new channel is implementing this interface and registering it, and NOTHING
 * upstream changes. It is also what lets the platform lose a provider without
 * losing notifications — a channel that is `NOT_CONFIGURED` or `UNAVAILABLE` is
 * simply skipped, and the others carry on.
 *
 * `send` returns a RESULT, never throws for an expected failure. The distinction
 * between a retryable failure (a timeout, a 503) and a permanent one (a bad
 * address, a 400) is the channel's to make — it is the only layer that understands
 * its provider's errors — and the retry engine acts on `retryable`.
 */
export interface INotificationChannel {
  readonly channel: NotificationChannel;

  /** Is this channel wired up? Unconfigured channels are skipped, not failed. */
  isConfigured(): boolean;

  /** Cheap liveness check for the health surface. Never throws. */
  health(): Promise<{ status: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED"; error: string | null }>;

  /** Deliver. Returns a result; only unexpected bugs throw. */
  send(notification: Notification): Promise<DeliveryResult>;
}
