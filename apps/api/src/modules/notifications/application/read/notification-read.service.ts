import { Injectable } from "@nestjs/common";
import type { NotificationOverview } from "@aegis/contracts";
import { NotificationRepository } from "../../infrastructure/repository/notification.repository";
import { ChannelRegistry } from "../channels/channel.registry";
import { NotificationOrchestrator } from "../orchestrator/notification.orchestrator";
import { PreferenceResolver } from "../preferences/preference.resolver";

/**
 * The read side — what the Notifications page and the admin surface consume.
 *
 * It reports what was DELIVERED, not what should have been: recent deliveries with
 * their real lifecycle status, per-channel health (including the honest
 * NOT_CONFIGURED for external providers with no credentials), and the recipient's
 * current preferences. Nothing is projected or invented — a suppressed notification
 * shows as suppressed, a failed one as failed.
 */
@Injectable()
export class NotificationReadService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly channels: ChannelRegistry,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly preferences: PreferenceResolver,
  ) {}

  async overview(recipient = "default", now = Date.now()): Promise<NotificationOverview> {
    const since = now - 86_400_000;
    const [recent, stats] = await Promise.all([
      this.repository.recent(100),
      this.repository.statsSince(since),
    ]);

    const channels = await this.channels.healthReport((channel) => {
      /* Prefer the persisted daily counts; fall back to the in-memory tally. */
      const persisted = stats.byChannel[channel];
      if (persisted) return { sent: persisted.sent, failed: persisted.failed, lastError: this.orchestrator.countsFor(channel).lastError };
      const live = this.orchestrator.countsFor(channel);
      return { sent: live.sent, failed: live.failed, lastError: live.lastError };
    });

    return {
      recent,
      channels,
      stats: {
        today: stats.today,
        delivered: stats.delivered,
        failed: stats.failed,
        suppressed: stats.suppressed,
        deliveryRate:
          stats.delivered + stats.failed > 0
            ? stats.delivered / (stats.delivered + stats.failed)
            : null,
      },
      preferences: this.preferences.preferencesFor(recipient),
    };
  }

  async metrics(now = Date.now()): Promise<Record<string, unknown>> {
    const stats = await this.repository.statsSince(now - 86_400_000);
    const channels = await this.channels.healthReport(() => ({ sent: 0, failed: 0, lastError: null }));
    return {
      notificationsToday: stats.today,
      delivered: stats.delivered,
      failed: stats.failed,
      suppressed: stats.suppressed,
      deliveryRate: stats.delivered + stats.failed > 0 ? stats.delivered / (stats.delivered + stats.failed) : null,
      channels: channels.map((c) => ({ channel: c.channel, status: c.status })),
      configuredChannels: this.channels.configured().map((c) => c.channel),
    };
  }
}
