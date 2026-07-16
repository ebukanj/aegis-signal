import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";

import { TelegramClient } from "../../infrastructure/telegram/telegram.client";
import { TelegramService } from "./telegram.service";

/**
 * The bot's ears. It long-polls the Telegram Bot API for the two commands the
 * platform understands — `/start <code>` to link an account, `/stop` to unlink —
 * and does nothing else. It is the reason linking needs no public webhook.
 *
 * Runs only when a token is configured; otherwise it stays asleep. Never overlaps
 * a poll with itself, and a poll that throws is logged and retried next tick — a
 * flaky network must never kill the linker.
 */
@Injectable()
export class TelegramPollingWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramPollingWorker.name);
  private offset = 0;
  private running = false;
  private armed = false;

  constructor(
    private readonly client: TelegramClient,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap(): void {
    this.armed = this.client.isConfigured();
    if (this.armed) this.logger.log("Telegram link polling armed");
  }

  @Interval(4000)
  async poll(): Promise<void> {
    if (!this.armed || this.running) return;
    this.running = true;
    try {
      const updates = await this.client.getUpdates(this.offset);
      for (const update of updates) {
        this.offset = Math.max(this.offset, update.updateId + 1);
        await this.handle(update.chatId, update.text.trim());
      }
    } catch (error) {
      this.logger.debug({ err: error }, "Telegram poll failed — will retry");
    } finally {
      this.running = false;
    }
  }

  private async handle(chatId: number, text: string): Promise<void> {
    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      if (!code) {
        await this.client.sendMessage(
          chatId,
          "👋 Welcome to Aegis Signal. Open <b>Settings → Telegram</b> in the app and tap Connect to link this chat.",
        );
        return;
      }
      const userId = this.telegram.redeemCode(code);
      if (!userId) {
        await this.client.sendMessage(chatId, "That link has expired. Generate a new one in Settings → Telegram.");
        return;
      }
      await this.telegram.completeLink(userId, chatId);
      await this.client.sendMessage(
        chatId,
        "✅ <b>Connected.</b> Your Aegis Signal alerts will arrive here. Send /stop anytime to disconnect.",
      );
      return;
    }

    if (text === "/stop") {
      const userId = await this.telegram.userForChat(chatId);
      if (userId) {
        await this.telegram.unlink(userId);
        await this.client.sendMessage(chatId, "🔕 Disconnected. You will no longer receive alerts here.");
      }
    }
  }
}
