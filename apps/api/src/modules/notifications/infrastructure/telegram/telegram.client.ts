import { Injectable, Logger } from "@nestjs/common";

import { AppConfigService } from "../../../../config/app-config.service";

/** One message a chat sent the bot — the shape we care about from an update. */
export interface TelegramMessage {
  updateId: number;
  chatId: number;
  text: string;
  from: string;
}

/**
 * A thin, dependency-free wrapper over the Telegram Bot API.
 *
 * ── Why hand-rolled over `node-telegram-bot-api` ──
 *
 * The Bot API is plain HTTPS + JSON, and Node has `fetch`. The two calls the
 * platform needs — send a message, and poll for `/start` link commands — are a few
 * lines each. A dependency here would be a library to keep patched for the sake of
 * two endpoints, on a platform that keeps its dependency list deliberately short.
 *
 * Every call returns a value or null; nothing throws for an expected failure (a
 * network blip, a 403 from a user who blocked the bot). The caller decides what a
 * null means — the channel treats a send failure as retryable, the poller simply
 * tries again next tick.
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);

  constructor(private readonly config: AppConfigService) {}

  get token(): string | undefined {
    return this.config.notifications.telegramBotToken;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private url(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  /** Send a message. Returns true on delivery, false on any failure. */
  async sendMessage(chatId: number | string, text: string): Promise<boolean> {
    if (!this.token) return false;

    try {
      const response = await fetch(this.url("sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          // HTML is far more forgiving than MarkdownV2, which requires escaping a
          // dozen characters that appear in every price and ratio we send.
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(`sendMessage → ${response.status} ${await safeText(response)}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, "sendMessage failed");
      return false;
    }
  }

  /** The bot's own @username, for building deep links. Null if unreachable. */
  async getUsername(): Promise<string | null> {
    if (!this.token) return null;
    try {
      const response = await fetch(this.url("getMe"), { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { ok: boolean; result?: { username?: string } };
      return body.result?.username ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Long-poll for new messages. `offset` is the last processed update id + 1, so an
   * update is delivered exactly once. Returns the messages, or empty on any error.
   */
  async getUpdates(offset: number): Promise<TelegramMessage[]> {
    if (!this.token) return [];

    try {
      const response = await fetch(
        this.url(`getUpdates?offset=${offset}&timeout=0&allowed_updates=["message"]`),
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) return [];

      const body = (await response.json()) as {
        ok: boolean;
        result?: Array<{
          update_id: number;
          message?: { chat?: { id: number }; text?: string; from?: { username?: string; first_name?: string } };
        }>;
      };

      const out: TelegramMessage[] = [];
      for (const update of body.result ?? []) {
        const chatId = update.message?.chat?.id;
        const text = update.message?.text;
        if (chatId === undefined || text === undefined) continue;
        out.push({
          updateId: update.update_id,
          chatId,
          text,
          from: update.message?.from?.username ?? update.message?.from?.first_name ?? "unknown",
        });
      }
      return out;
    } catch (error) {
      this.logger.debug({ err: error }, "getUpdates failed");
      return [];
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "";
  }
}
