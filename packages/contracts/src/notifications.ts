import { z } from "zod";
import { notificationChannelSchema } from "./enums/platform";
import { epochMsSchema } from "./common/value-objects";

/**
 * The Notification Engine — the communication layer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT DELIVERS INFORMATION. IT DECIDES NOTHING.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The decision has already been made — a signal was published, a trade settled, a
 * coin flagged. This engine answers only: *who should hear about it, on which
 * channel, and when?* It never creates a signal, never modifies one, never
 * recalculates a score, never overrides a risk decision. It is the last mile, and
 * the last mile carries the message; it does not rewrite it.
 *
 * The four promises every shape here serves: the right event, to the right user,
 * through the right channel, at the right time — **exactly once**, with full
 * observability. A notification the platform cannot prove it delivered is a
 * notification a trader cannot rely on, so every delivery carries its whole
 * lifecycle as a matter of record.
 */

/* ── What is being delivered ───────────────────────────────────────── */

/** The platform events worth telling a trader about. */
export const notificationTypeSchema = z.enum([
  "PRIME_SIGNAL",
  "SIGNAL_PUBLISHED",
  "SIGNAL_TRIGGERED",
  "TAKE_PROFIT",
  "STOP_LOSS",
  "SIGNAL_EXPIRED",
  "RISK_ALERT",
  "STRATEGY_DISABLED",
  "EXCHANGE_OFFLINE",
  "MAINTENANCE",
  "SYSTEM_ANNOUNCEMENT",
  "DIGEST",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * How loudly to shout. Priority drives channel selection, quiet-hours bypass, and
 * dedup urgency. A STOP_LOSS is CRITICAL and may wake a trader at 3am; a DIGEST is
 * LOW and waits for morning.
 */
export const notificationPrioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;

/**
 * The delivery lifecycle. Richer than the platform's coarse `notificationStatus`
 * (QUEUED/SENT/DELIVERED/FAILED) because the engine needs to distinguish a
 * transient retry from a permanent death, and a quiet-hours hold from a real
 * failure — the difference between "we are trying" and "we gave up".
 */
export const deliveryStatusSchema = z.enum([
  "QUEUED",
  "SENDING",
  "DELIVERED",
  /** A transient failure; a retry is scheduled. */
  "RETRYING",
  /** Retries exhausted. In the dead-letter queue. */
  "FAILED",
  /** Held by quiet hours or a preference filter — deliberately not sent. */
  "SUPPRESSED",
  /** Cancelled before delivery (a superseding event, a dedup hit). */
  "CANCELLED",
  /** Too old to matter by the time it would have sent. */
  "EXPIRED",
]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

/* ── The rendered message ──────────────────────────────────────────── */

/**
 * The content, rendered once and carried through delivery unchanged. Both forms
 * are produced so a channel picks what it can display — Telegram wants markdown, an
 * SMS wants plain text — without the renderer running per channel.
 */
export const renderedMessageSchema = z.object({
  title: z.string(),
  markdown: z.string(),
  plain: z.string(),
  /** Deep link to the signal or page this concerns. */
  link: z.string().nullable(),
});
export type RenderedMessage = z.infer<typeof renderedMessageSchema>;

/* ── The delivery record ───────────────────────────────────────────── */

/**
 * One attempt to deliver one notification to one recipient on one channel.
 *
 * The `id` is DETERMINISTIC — a hash of (notification, recipient, channel) — which
 * is what makes "exactly once" enforceable: a re-processed event produces the same
 * id, and the store refuses the duplicate. `attempts` and the audited status
 * transitions are the observability the engine promises.
 */
export const notificationSchema = z.object({
  id: z.string(),

  type: notificationTypeSchema,
  priority: notificationPrioritySchema,
  channel: notificationChannelSchema,

  /** Who it is for. A user id when users exist; "default" until then. */
  recipient: z.string(),

  /** What it is about — the signal/coin this concerns, for dedup and filtering. */
  subject: z.string().nullable(),

  message: renderedMessageSchema,

  status: deliveryStatusSchema,
  attempts: z.number().int().nonnegative(),
  /** The provider's last response — a message id on success, an error on failure. */
  providerResponse: z.string().nullable(),

  createdAt: epochMsSchema,
  /** When it should be sent (now, or a future time for scheduled/quiet-hours). */
  scheduledFor: epochMsSchema,
  deliveredAt: epochMsSchema.nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

/* ── User preferences ──────────────────────────────────────────────── */

/**
 * What a recipient wants, and does not. The engine's whole job on the "who/when"
 * axis is to honour this — *users should never receive unwanted notifications.*
 *
 * Until a user system exists, one DEFAULT profile stands in. The shape is
 * per-user-ready so that when Users lands, this is loaded from settings and nothing
 * else changes.
 */
export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  /** 0–23, in the user's timezone. Start may be after end (an overnight window). */
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  /** CRITICAL notifications may pierce quiet hours if this is true. */
  allowCriticalBypass: z.boolean(),
});
export type QuietHours = z.infer<typeof quietHoursSchema>;

export const notificationPreferencesSchema = z.object({
  recipient: z.string(),
  /** Channels the user has switched on. Empty means "no notifications". */
  enabledChannels: z.array(notificationChannelSchema),
  /** Only notifications at or above this priority are delivered. */
  minimumPriority: notificationPrioritySchema,
  quietHours: quietHoursSchema,
  timezone: z.string(),
  /** Only notify about these strategies; empty means all. */
  strategyFilter: z.array(z.string()),
  /** Only notify about these coins; empty means all. */
  watchlist: z.array(z.string()),
  /** Suppress signals below this confidence. */
  minimumConfidence: z.number().min(0).max(100),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/* ── Read shapes ───────────────────────────────────────────────────── */

/** Per-channel delivery health, for the admin surface and the settings page. */
export const channelDeliveryHealthSchema = z.object({
  channel: notificationChannelSchema,
  /** Whether the provider can currently deliver. IN_APP is always available. */
  status: z.enum(["AVAILABLE", "DEGRADED", "UNAVAILABLE", "NOT_CONFIGURED"]),
  sentToday: z.number().int().nonnegative(),
  failedToday: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});
export type ChannelDeliveryHealth = z.infer<typeof channelDeliveryHealthSchema>;

/** The Notifications page view: recent deliveries + stats + channel health. */
export const notificationOverviewSchema = z.object({
  recent: z.array(notificationSchema),
  channels: z.array(channelDeliveryHealthSchema),
  stats: z.object({
    today: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    suppressed: z.number().int().nonnegative(),
    deliveryRate: z.number().min(0).max(1).nullable(),
  }),
  preferences: notificationPreferencesSchema,
});
export type NotificationOverview = z.infer<typeof notificationOverviewSchema>;
