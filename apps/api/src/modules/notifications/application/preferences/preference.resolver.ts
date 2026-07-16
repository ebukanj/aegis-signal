import { Injectable, Optional } from "@nestjs/common";
import type {
  NotificationChannel,
  NotificationPreferences,
  NotificationPriority,
} from "@aegis/contracts";
import { NotificationPreferencesProvider } from "./notification-preferences.provider";

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

/**
 * What a recipient wants, and — the harder half — what they DON'T.
 *
 * *Users should never receive unwanted notifications.* Every decision here is a
 * gate that can only ever REMOVE a delivery, never add one: a channel not enabled,
 * a priority below the threshold, a coin off the watchlist, a signal under the
 * confidence floor, the hours a trader asked not to be disturbed. The orchestrator
 * consults this before it sends, and a notification that fails any gate is
 * SUPPRESSED — recorded, so a trader can see it was held and why, but not
 * delivered.
 */
@Injectable()
export class PreferenceResolver {
  /**
   * The default profile for a recipient we know nothing about (including the
   * broadcast "default"). Conservative: in-app only, quiet hours off — a sensible
   * baseline that annoys no one.
   */
  private readonly defaultProfile: NotificationPreferences = {
    recipient: "default",
    enabledChannels: ["IN_APP"],
    minimumPriority: "LOW",
    quietHours: { enabled: false, startHour: 22, endHour: 7, allowCriticalBypass: true },
    timezone: "UTC",
    strategyFilter: [],
    watchlist: [],
    minimumConfidence: 0,
  };

  /* Optional so unit tests can `new PreferenceResolver()`. In the app the provider
   * is injected and supplies each real user's mapped preferences from its cache. */
  constructor(@Optional() private readonly provider?: NotificationPreferencesProvider) {}

  preferencesFor(recipient: string): NotificationPreferences {
    return this.provider?.get(recipient) ?? this.defaultProfile;
  }

  /**
   * Which channels should carry this notification, or a reason it is suppressed.
   *
   * Returns the channels to deliver on (a subset of enabled) — empty with a reason
   * means the whole notification is suppressed.
   */
  resolve(input: {
    prefs: NotificationPreferences;
    priority: NotificationPriority;
    coin: string | null;
    strategyId: string | null;
    confidence: number | null;
    now: number;
  }): { channels: NotificationChannel[]; suppressedReason: string | null } {
    const { prefs, priority } = input;

    /* Priority threshold. */
    if (PRIORITY_RANK[priority] < PRIORITY_RANK[prefs.minimumPriority]) {
      return { channels: [], suppressedReason: `below the ${prefs.minimumPriority} priority threshold` };
    }

    /* Watchlist. Empty watchlist means "everything". */
    if (prefs.watchlist.length > 0 && input.coin && !prefs.watchlist.includes(input.coin)) {
      return { channels: [], suppressedReason: `${input.coin} is not on the watchlist` };
    }

    /* Strategy filter. */
    if (prefs.strategyFilter.length > 0 && input.strategyId && !prefs.strategyFilter.includes(input.strategyId)) {
      return { channels: [], suppressedReason: `${input.strategyId} is not in the strategy filter` };
    }

    /* Confidence floor. */
    if (input.confidence !== null && input.confidence < prefs.minimumConfidence) {
      return { channels: [], suppressedReason: `confidence ${input.confidence} below the ${prefs.minimumConfidence} floor` };
    }

    /* Quiet hours — the one gate CRITICAL can pierce. */
    if (this.inQuietHours(prefs, input.now)) {
      const bypass = priority === "CRITICAL" && prefs.quietHours.allowCriticalBypass;
      if (!bypass) {
        return { channels: [], suppressedReason: "quiet hours" };
      }
    }

    if (prefs.enabledChannels.length === 0) {
      return { channels: [], suppressedReason: "no channels enabled" };
    }

    return { channels: prefs.enabledChannels, suppressedReason: null };
  }

  /** Is `now` inside the recipient's quiet window, in their timezone? */
  inQuietHours(prefs: NotificationPreferences, now: number): boolean {
    if (!prefs.quietHours.enabled) return false;

    const hour = hourInTimezone(now, prefs.timezone);
    const { startHour, endHour } = prefs.quietHours;

    /* An overnight window (22→7) wraps midnight; a daytime window (1→6) does not. */
    return startHour <= endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;
  }
}

/** The hour-of-day at `epochMs` in an IANA timezone, without a date library. */
function hourInTimezone(epochMs: number, timezone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(epochMs));
    /* Intl can render midnight as "24"; normalise it. */
    return Number(formatted) % 24;
  } catch {
    /* An unknown timezone falls back to UTC — better than throwing on a bad pref. */
    return new Date(epochMs).getUTCHours();
  }
}
