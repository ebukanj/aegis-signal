import { Injectable } from "@nestjs/common";
import type { Notification, NotificationChannel } from "@aegis/contracts";

import type { DeliveryResult, INotificationChannel } from "../../domain/channel";
import { NotificationPreferencesProvider } from "../../application/preferences/notification-preferences.provider";
import { TelegramClient } from "../telegram/telegram.client";

/**
 * The Telegram channel — LIVE (M18).
 *
 * The recipient on a Notification is a USER id; Telegram needs a CHAT id. This
 * resolves the one to the other through the preferences cache (a user's chat id is
 * saved when they link the bot), then sends over the Bot API. Two "no" answers, and
 * they are different: no bot token means the channel is NOT_CONFIGURED and every
 * delivery is skipped cleanly; a linked-but-unreachable chat (the user blocked the
 * bot) is a permanent failure, not a retry.
 */
@Injectable()
export class TelegramChannel implements INotificationChannel {
  readonly channel: NotificationChannel = "TELEGRAM";

  constructor(
    private readonly client: TelegramClient,
    private readonly prefs: NotificationPreferencesProvider,
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async health(): Promise<{
    status: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";
    error: string | null;
  }> {
    if (!this.isConfigured()) {
      return { status: "NOT_CONFIGURED", error: "TELEGRAM_BOT_TOKEN is not set" };
    }
    const username = await this.client.getUsername();
    return username
      ? { status: "AVAILABLE", error: null }
      : { status: "UNAVAILABLE", error: "the Bot API did not answer getMe" };
  }

  async send(notification: Notification): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        retryable: false,
        error: "TELEGRAM_BOT_TOKEN unset — skipped, not failed",
      };
    }

    const chatId = this.prefs.chatIdFor(notification.recipient);
    if (!chatId) {
      // The user has Telegram enabled somewhere but no linked chat. Not our bug and
      // not retryable — nothing to send to.
      return {
        ok: false,
        retryable: false,
        error: `${notification.recipient} has no linked Telegram chat`,
      };
    }

    const sent = await this.client.sendMessage(chatId, this.format(notification));
    return sent
      ? { ok: true, providerResponse: `telegram:${chatId}` }
      : { ok: false, retryable: true, error: "the Bot API rejected or dropped the message" };
  }

  /** Compose the HTML message Telegram renders. Escapes the user-visible text. */
  private format(notification: Notification): string {
    const m = notification.message;
    const title = `<b>${escapeHtml(m.title)}</b>`;
    const body = m.plain ? `\n${escapeHtml(m.plain)}` : "";
    const link = m.link ? `\n\n<a href="${escapeHtml(m.link)}">Open in Aegis Signal</a>` : "";
    return `${title}${body}${link}`;
  }
}

/** Telegram HTML mode only needs these three escaped. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
