import { Injectable } from "@nestjs/common";
import type { ChannelDeliveryHealth, NotificationChannel } from "@aegis/contracts";
import type { INotificationChannel } from "../../domain/channel";
import { InAppChannel } from "../../infrastructure/channels/in-app.channel";
import {
  EmailChannel,
  PushChannel,
  TelegramChannel,
  WhatsappChannel,
} from "../../infrastructure/channels/external.channels";

/**
 * The channels, keyed by name.
 *
 * The registry is the whole of the "pluggable providers" requirement: the
 * orchestrator asks it for a channel by name and gets something implementing the
 * one interface. Which providers exist, whether they are configured, is entirely a
 * registration concern — adding SMS or Discord is a new class and a line here, and
 * nothing that routes or renders or retries changes.
 */
@Injectable()
export class ChannelRegistry {
  private readonly channels = new Map<NotificationChannel, INotificationChannel>();

  constructor(
    inApp: InAppChannel,
    telegram: TelegramChannel,
    whatsapp: WhatsappChannel,
    email: EmailChannel,
    push: PushChannel,
  ) {
    for (const channel of [inApp, telegram, whatsapp, email, push]) {
      this.channels.set(channel.channel, channel);
    }
  }

  get(channel: NotificationChannel): INotificationChannel | null {
    return this.channels.get(channel) ?? null;
  }

  all(): INotificationChannel[] {
    return [...this.channels.values()];
  }

  /** Only channels that can actually deliver — the rest are skipped, not failed. */
  configured(): INotificationChannel[] {
    return this.all().filter((c) => c.isConfigured());
  }

  async healthReport(counts: (channel: NotificationChannel) => { sent: number; failed: number; lastError: string | null }): Promise<ChannelDeliveryHealth[]> {
    const report: ChannelDeliveryHealth[] = [];
    for (const channel of this.all()) {
      const h = await channel.health();
      const c = counts(channel.channel);
      report.push({
        channel: channel.channel,
        status: h.status,
        sentToday: c.sent,
        failedToday: c.failed,
        lastError: c.lastError ?? h.error,
      });
    }
    return report;
  }
}
