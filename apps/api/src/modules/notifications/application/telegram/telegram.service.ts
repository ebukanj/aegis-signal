import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { AppConfigService } from "../../../../config/app-config.service";
import { AuthService } from "../../../auth/application/auth.service";
import { TelegramClient } from "../../infrastructure/telegram/telegram.client";

interface LinkCode {
  userId: string;
  expiresAt: number;
}

export interface TelegramStatus {
  /** Is a bot token set at all? Without it Telegram is off for everyone. */
  configured: boolean;
  /** Has THIS user linked their chat? */
  connected: boolean;
  /** The bot's @username, for the deep link. Null when not configured. */
  botUsername: string | null;
}

/**
 * The Telegram account link — how a user's chat becomes reachable.
 *
 * ── The flow, and why it needs no public webhook ──
 *
 * The user asks to connect. We mint a short-lived one-time CODE tied to their user
 * id and hand back a `t.me/<bot>?start=<code>` deep link. They tap it, Telegram
 * opens the bot and sends `/start <code>`, and the polling worker (which long-polls
 * `getUpdates`) sees it, exchanges the code for the user id, and saves the chat id
 * to that user's preferences. No inbound HTTPS endpoint, no domain, no TLS to
 * terminate — which is exactly what a self-hosted box on Coolify wants.
 *
 * The code is single-use and expires in fifteen minutes: a link that leaks is worth
 * nothing a quarter-hour later, and cannot be replayed.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly codes = new Map<string, LinkCode>();
  private static readonly TTL_MS = 15 * 60 * 1000;
  private cachedUsername: string | null = null;

  constructor(
    private readonly client: TelegramClient,
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  async status(userId: string): Promise<TelegramStatus> {
    const prefs = await this.auth.preferences(userId);
    return {
      configured: this.client.isConfigured(),
      connected: prefs.telegramChatId !== null,
      botUsername: await this.botUsername(),
    };
  }

  /** Begin linking: mint a code and return the deep link the user taps. */
  async beginLink(userId: string): Promise<{ deepLink: string; botUsername: string; expiresInMinutes: number }> {
    const username = await this.botUsername();
    if (!this.client.isConfigured() || !username) {
      throw new Error("Telegram is not configured on this server");
    }

    this.sweepExpired();
    const code = randomBytes(9).toString("base64url");
    this.codes.set(code, { userId, expiresAt: Date.now() + TelegramService.TTL_MS });

    return {
      deepLink: `https://t.me/${username}?start=${code}`,
      botUsername: username,
      expiresInMinutes: 15,
    };
  }

  /** Exchange a `/start` code for the user it belongs to. Single use. */
  redeemCode(code: string): string | null {
    const entry = this.codes.get(code);
    if (!entry) return null;
    this.codes.delete(code);
    if (entry.expiresAt < Date.now()) return null;
    return entry.userId;
  }

  /** Save a linked chat to the user's preferences and enable the channel. */
  async completeLink(userId: string, chatId: number | string): Promise<void> {
    const current = await this.auth.preferences(userId);
    await this.auth.updatePreferences(userId, {
      telegramChatId: String(chatId),
      notifications: { ...current.notifications, telegram: true },
    });
    this.logger.log(`Telegram linked for user ${userId}`);
  }

  /** Remove the link and disable the channel (from Settings or `/stop`). */
  async unlink(userId: string): Promise<void> {
    const current = await this.auth.preferences(userId);
    await this.auth.updatePreferences(userId, {
      telegramChatId: null,
      notifications: { ...current.notifications, telegram: false },
    });
  }

  /** Which user, if any, owns this chat id — for the `/stop` command. */
  async userForChat(chatId: number | string): Promise<string | null> {
    const all = await this.auth.allPreferences();
    const match = all.find((u) => u.preferences.telegramChatId === String(chatId));
    return match?.userId ?? null;
  }

  private async botUsername(): Promise<string | null> {
    const configured = this.config.notifications.telegramBotUsername;
    if (configured) return configured.replace(/^@/, "");
    if (this.cachedUsername) return this.cachedUsername;
    this.cachedUsername = await this.client.getUsername();
    return this.cachedUsername;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [code, entry] of this.codes) {
      if (entry.expiresAt < now) this.codes.delete(code);
    }
  }
}
