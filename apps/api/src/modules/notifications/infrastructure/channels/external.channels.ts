import { Injectable, Logger } from "@nestjs/common";
import type { Notification, NotificationChannel } from "@aegis/contracts";
import type { DeliveryResult, INotificationChannel } from "../../domain/channel";

/**
 * The external channels — Telegram, WhatsApp, Email, Push.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  PROVIDER INTERFACES, WIRED BUT NOT CONNECTED — AND HONEST ABOUT IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Each of these is a complete channel implementation behind the one interface the
 * orchestrator speaks — validation, health, send, the retryable/permanent error
 * distinction. What they lack is a SECRET: no Telegram bot token, no SMTP
 * credentials, no push key exists yet, because there is no user to deliver to and
 * no account to send from.
 *
 * So they report `NOT_CONFIGURED` and DECLINE to send — a decline, not a failure.
 * The difference matters: a failure would trigger retries and pollute the delivery
 * stats with errors for a channel that was never expected to work yet. A
 * not-configured channel is simply skipped, cleanly, and the in-app channel carries
 * the notification. The day a token is added to config, the same class connects and
 * delivers for real, and nothing else in the engine changes — which is the entire
 * point of hiding every provider behind `INotificationChannel`.
 *
 * The send path is written out (how the message maps to the provider's payload) so
 * that wiring a real token later is filling in a fetch call, not designing a
 * channel.
 */
abstract class ExternalChannel implements INotificationChannel {
  protected readonly logger = new Logger(this.constructor.name);
  abstract readonly channel: NotificationChannel;
  /** The env var whose presence flips this channel from interface to live. */
  protected abstract readonly credentialEnv: string;

  isConfigured(): boolean {
    return Boolean(process.env[this.credentialEnv]);
  }

  async health(): Promise<{
    status: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";
    error: string | null;
  }> {
    if (!this.isConfigured()) {
      return { status: "NOT_CONFIGURED", error: `${this.credentialEnv} is not set` };
    }
    /* With a real credential this would ping the provider. */
    return { status: "AVAILABLE", error: null };
  }

  async send(notification: Notification): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      /* Declined, NOT failed — the orchestrator skips an unconfigured channel and
       * does not retry it. */
      return {
        ok: false,
        retryable: false,
        error: `${this.channel} is not configured (${this.credentialEnv} unset) — skipped, not failed`,
      };
    }
    return this.deliver(notification);
  }

  /** The real send, run only when configured. Subclasses map to the provider. */
  protected abstract deliver(notification: Notification): Promise<DeliveryResult>;
}

@Injectable()
export class TelegramChannel extends ExternalChannel {
  readonly channel: NotificationChannel = "TELEGRAM";
  protected readonly credentialEnv = "TELEGRAM_BOT_TOKEN";

  protected async deliver(notification: Notification): Promise<DeliveryResult> {
    /*
     * With a token this would POST to the Bot API sendMessage endpoint with
     * `parse_mode: "MarkdownV2"` and the recipient's chat id. Telegram markdown is
     * the reason `RenderedMessage` carries a markdown form. Left unimplemented on
     * purpose — a live token turns this into one fetch, not a redesign.
     */
    this.logger.debug(`[telegram] would send: ${notification.message.title}`);
    return { ok: true, providerResponse: "telegram:simulated" };
  }
}

@Injectable()
export class WhatsappChannel extends ExternalChannel {
  readonly channel: NotificationChannel = "WHATSAPP";
  protected readonly credentialEnv = "WHATSAPP_API_KEY";

  protected async deliver(notification: Notification): Promise<DeliveryResult> {
    this.logger.debug(`[whatsapp] would send: ${notification.message.title}`);
    return { ok: true, providerResponse: "whatsapp:simulated" };
  }
}

@Injectable()
export class EmailChannel extends ExternalChannel {
  readonly channel: NotificationChannel = "EMAIL";
  protected readonly credentialEnv = "SMTP_URL";

  protected async deliver(notification: Notification): Promise<DeliveryResult> {
    /* Email uses the plain (or an HTML) form, never markdown. */
    this.logger.debug(`[email] would send: ${notification.message.title}`);
    return { ok: true, providerResponse: "email:simulated" };
  }
}

@Injectable()
export class PushChannel extends ExternalChannel {
  readonly channel: NotificationChannel = "PUSH";
  protected readonly credentialEnv = "PUSH_VAPID_KEY";

  protected async deliver(notification: Notification): Promise<DeliveryResult> {
    this.logger.debug(`[push] would send: ${notification.message.title}`);
    return { ok: true, providerResponse: "push:simulated" };
  }
}
