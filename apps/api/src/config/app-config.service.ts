import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "./env.schema";

/**
 * Strongly-typed configuration.
 *
 * Nothing in the application reads `process.env` directly — it reads this. The
 * difference matters: `process.env.PORT` is `string | undefined` forever, and
 * every caller has to remember to coerce it and handle the undefined. Here it is
 * a `number`, because the environment was validated at boot and cannot be
 * anything else.
 *
 * Grouped by concern rather than exposed flat, so a module asks for what it
 * needs and cannot reach what it does not.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  /* ── Application ─────────────────────────────────────────────────── */

  get env(): Env["NODE_ENV"] {
    return this.get("NODE_ENV");
  }

  get isProduction(): boolean {
    return this.env === "production";
  }

  get isDevelopment(): boolean {
    return this.env === "development";
  }

  get app() {
    return {
      port: this.get("PORT"),
      url: this.get("APP_URL"),
      timezone: this.get("TZ"),
      /** Origins allowed to call the API. */
      corsOrigins: this.get("WEB_ORIGIN")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    };
  }

  /* ── Data ────────────────────────────────────────────────────────── */

  get database() {
    return { url: this.get("DATABASE_URL") };
  }

  get redis() {
    return { url: this.get("REDIS_URL") };
  }

  /* ── Security ────────────────────────────────────────────────────── */

  get security() {
    return {
      jwtSecret: this.get("JWT_SECRET"),
      jwtExpires: this.get("JWT_EXPIRES"),
      rateLimitPerMinute: this.get("RATE_LIMIT"),
    };
  }

  /* ── Observability ───────────────────────────────────────────────── */

  get logging() {
    return { level: this.get("LOG_LEVEL") };
  }

  /* ── Exchange ────────────────────────────────────────────────────── */

  get exchange() {
    return {
      timeoutMs: this.get("CCXT_TIMEOUT"),
      websocketHeartbeatMs: this.get("WS_HEARTBEAT"),
      /**
       * Empty means "use the operating system's resolver" — the production path.
       * Populated only where the local network filters exchanges at the DNS layer.
       */
      dnsServers: (this.get("EXCHANGE_DNS_SERVERS") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  /* ── Macro / economic calendar (M19) ─────────────────────────────── */

  get macro() {
    return { calendarApiKey: this.get("ECONOMIC_CALENDAR_API_KEY") };
  }

  /* ── Identity & access (M16) ─────────────────────────────────────── */

  get auth() {
    return {
      jwtSecret: this.get("JWT_SECRET"),
      /** `JWT_EXPIRES` ("15m", "7d", "3600s", or a bare number) as seconds. */
      jwtTtlSeconds: durationToSeconds(this.get("JWT_EXPIRES")),
    };
  }

  /* ── Live Scan (M15) ─────────────────────────────────────────────── */

  get scan() {
    return {
      enabled: this.get("SCAN_ENABLED"),
      intervalMs: this.get("SCAN_INTERVAL_MS"),
      maxSymbols: this.get("SCAN_MAX_SYMBOLS"),
      priority: (this.get("SCAN_UNIVERSE") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      backfillOnBoot: this.get("SIGNAL_BACKFILL_ON_BOOT"),
    };
  }

  /* ── Integrations ────────────────────────────────────────────────── */

  get notifications() {
    return {
      telegramBotToken: this.get("TELEGRAM_BOT_TOKEN"),
      telegramBotUsername: this.get("TELEGRAM_BOT_USERNAME"),
      whatsappToken: this.get("WHATSAPP_TOKEN"),
    };
  }

  /**
   * AI providers must remain interchangeable (AGENTS.md §6). Business logic
   * never talks to one directly — everything goes through the AI Gateway.
   */
  get ai() {
    return {
      openaiKey: this.get("OPENAI_API_KEY"),
      anthropicKey: this.get("ANTHROPIC_API_KEY"),
      googleKey: this.get("GOOGLE_API_KEY"),
    };
  }
}

/**
 * Parse a duration string into seconds. Accepts a bare number (seconds), or a
 * number suffixed with s/m/h/d. Anything unrecognised falls back to 7 days —
 * a sane session length, never zero (which would expire every token instantly).
 */
function durationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd]?)$/.exec(value.trim());
  if (!match) return 604_800;

  const n = Number(match[1]);
  switch (match[2]) {
    case "s":
    case "":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3_600;
    case "d":
      return n * 86_400;
    default:
      return 604_800;
  }
}
