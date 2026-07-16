import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { NotificationChannel, NotificationPreferences, UserPreferences } from "@aegis/contracts";

import { AuthService } from "../../../auth/application/auth.service";

interface CachedRecipient {
  prefs: NotificationPreferences;
  chatId: string | null;
  /** The user's real watchlist — kept out of `prefs` so the resolver does not
   *  double-filter; the Telegram fan-out policy reads it directly. */
  watchlist: string[];
}

/**
 * The bridge between a USER's preferences (owned by the auth module) and what the
 * NOTIFICATION engine needs to know: which channels this person wants, their quiet
 * hours, their watchlist, and where to reach them on Telegram.
 *
 * ── Why a cache, hydrated by events ──
 *
 * The orchestrator resolves preferences on the hot path of every dispatch, and it
 * does so synchronously. Reaching into the database there would put a query in
 * front of every notification. So this holds a small in-memory map, hydrated once
 * at boot and kept fresh by the `user.preferences.changed` event the auth module
 * emits whenever a user edits their settings or links Telegram. The read is O(1)
 * and never touches I/O.
 *
 * A user we have never seen falls back to the resolver's conservative default
 * (in-app only) — the safe baseline that annoys no one.
 */
@Injectable()
export class NotificationPreferencesProvider implements OnModuleInit {
  private readonly logger = new Logger(NotificationPreferencesProvider.name);
  private readonly cache = new Map<string, CachedRecipient>();

  constructor(private readonly auth: AuthService) {}

  async onModuleInit(): Promise<void> {
    try {
      const all = await this.auth.allPreferences();
      for (const { userId, preferences } of all) {
        this.cache.set(userId, this.map(userId, preferences));
      }
      this.logger.log(`Loaded notification preferences for ${this.cache.size} user(s)`);
    } catch (error) {
      // A cold cache is safe — everyone falls back to the default until they next
      // change a setting. Never let this stop the app booting.
      this.logger.warn({ err: error }, "Could not preload notification preferences");
    }
  }

  @OnEvent("user.preferences.changed")
  onChanged(event: { userId: string; preferences: UserPreferences }): void {
    this.cache.set(event.userId, this.map(event.userId, event.preferences));
  }

  /** The mapped notification preferences for a user, or null if unknown. */
  get(userId: string): NotificationPreferences | null {
    return this.cache.get(userId)?.prefs ?? null;
  }

  /** The user's Telegram chat id, or null if they have not linked it. */
  chatIdFor(userId: string): string | null {
    return this.cache.get(userId)?.chatId ?? null;
  }

  /**
   * Who should receive THIS signal on Telegram, and where.
   *
   * The policy — deliberately not spammy: a user gets a Telegram alert only for a
   * PRIME signal (the few the platform stakes its name on) or a signal on a coin
   * they explicitly WATCH. A user with no watchlist and no Prime gets nothing, so
   * enabling Telegram never turns into a firehose; you opt into the coins you care
   * about by watching them — which is exactly the watchlist's promise.
   */
  telegramTargetsFor(coin: string, isPrime: boolean): { userId: string; chatId: string }[] {
    const out: { userId: string; chatId: string }[] = [];
    for (const [userId, entry] of this.cache) {
      if (!entry.chatId || !entry.prefs.enabledChannels.includes("TELEGRAM")) continue;
      if (isPrime || entry.watchlist.includes(coin)) {
        out.push({ userId, chatId: entry.chatId });
      }
    }
    return out;
  }

  private map(userId: string, prefs: UserPreferences): CachedRecipient {
    const channels: NotificationChannel[] = [];
    if (prefs.notifications.inApp) channels.push("IN_APP");
    if (prefs.notifications.telegram) channels.push("TELEGRAM");
    if (prefs.notifications.email) channels.push("EMAIL");

    const qh = prefs.notifications.quietHours;

    return {
      chatId: prefs.telegramChatId,
      watchlist: prefs.watchlist,
      prefs: {
        recipient: userId,
        enabledChannels: channels,
        minimumPriority: "LOW",
        quietHours: {
          enabled: qh !== null,
          startHour: qh?.start ?? 22,
          endHour: qh?.end ?? 7,
          allowCriticalBypass: true,
        },
        timezone: "UTC",
        strategyFilter: [],
        // Empty on purpose: the resolver stays a channel/priority/quiet-hours gate,
        // and the watchlist policy lives in `telegramTargetsFor` above — one owner.
        watchlist: [],
        minimumConfidence: 0,
      },
    };
  }
}
