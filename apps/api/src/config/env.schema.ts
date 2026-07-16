import { z } from "zod";

/**
 * The environment, validated.
 *
 * The application refuses to start if this fails. That is the point: a backend
 * that boots with a missing DATABASE_URL and only discovers it under load has
 * merely deferred the crash to the worst possible moment.
 *
 * NO SILENT DEFAULTS for anything that carries risk. A default port is harmless.
 * A default JWT secret is a vulnerability with a friendly face — so secrets have
 * no defaults and no fallbacks, and in production the schema refuses the
 * development placeholders outright.
 */

const port = z.coerce.number().int().min(1).max(65535);

/** A secret must be absent or real. "changeme" is worse than nothing. */
const secret = z
  .string()
  .min(32, "A secret shorter than 32 characters is not a secret");

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    /* ── Application ───────────────────────────────────────────────── */
    PORT: port.default(4000),
    /** Public URL of the API. Never assume localhost (AGENTS.md §7). */
    APP_URL: z.url(),
    /** Comma-separated origins allowed to call the API. */
    WEB_ORIGIN: z.string().min(1),
    /** Everything the platform does is timestamped. It does it in UTC. */
    TZ: z.string().default("UTC"),

    /* ── Data ──────────────────────────────────────────────────────── */
    DATABASE_URL: z.string().startsWith("postgresql://"),
    REDIS_URL: z.string().startsWith("redis"),

    /* ── Security ──────────────────────────────────────────────────── */
    JWT_SECRET: secret,
    JWT_EXPIRES: z.string().default("15m"),
    /** Requests per minute, per IP. */
    RATE_LIMIT: z.coerce.number().int().positive().default(120),

    /* ── Observability ─────────────────────────────────────────────── */
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),

    /* ── Exchange ──────────────────────────────────────────────────── */
    CCXT_TIMEOUT: z.coerce.number().int().positive().default(15_000),
    WS_HEARTBEAT: z.coerce.number().int().positive().default(30_000),

    /* ── Live Scan (M15) ───────────────────────────────────────────── */
    /**
     * The continuous scan is what makes the platform live — it sweeps the
     * universe on this interval, runs the full pipeline, and publishes real
     * signals. Off only for a deploy that consumes signals from elsewhere.
     */
    SCAN_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    /**
     * How often a full sweep runs. Below a bar's length so ordering stays fresh,
     * but not so tight that fetching N symbols × several timeframes trips an
     * exchange rate limit. 90s is a safe default for ~60 symbols.
     */
    SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(90_000),
    /**
     * The ceiling on how many symbols one sweep touches. The universe can be
     * large; this bounds the work so a broad scan never gets the platform IP
     * banned (market.config warns: a ban blinds every strategy at once).
     */
    SCAN_MAX_SYMBOLS: z.coerce.number().int().positive().default(60),
    /**
     * Priority coins, scanned first and always. Comma-separated bases
     * ("BTC,ETH,SOL"). Empty falls back to the market module's DEFAULT_UNIVERSE.
     * Everything the exchanges additionally list is scanned after these, up to
     * SCAN_MAX_SYMBOLS — so opportunity is not restricted to a fixed shortlist.
     */
    SCAN_UNIVERSE: z.string().optional(),
    /**
     * Bootstrap the feed from the historical calibration corpus on boot. Was the
     * only source before the live scan existed; now OFF by default, because the
     * live worker is the source of truth and historical setups would show as
     * already-invalidated. Leave false in production.
     */
    SIGNAL_BACKFILL_ON_BOOT: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    /**
     * DNS servers for exchange hostnames only. Comma-separated IPs.
     *
     * A development escape hatch. Many ISPs block cryptocurrency exchanges at
     * the DNS layer, and the failure is indistinguishable from an exchange
     * outage: `api.binance.com` simply does not resolve. Setting this routes
     * exchange lookups — and nothing else — through a resolver that answers
     * honestly.
     *
     * Leave it UNSET in production. A VPS has no reason to filter the exchanges
     * we depend on, and hard-coding DNS servers we do not operate is an outage
     * scheduled by someone else.
     */
    EXCHANGE_DNS_SERVERS: z
      .string()
      .optional()
      .refine(
        (value) =>
          value === undefined ||
          value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .every((s) => z.ipv4().safeParse(s).success || z.ipv6().safeParse(s).success),
        "EXCHANGE_DNS_SERVERS must be a comma-separated list of IP addresses",
      ),

    /* ── Integrations (optional until their milestone) ─────────────── */
    TELEGRAM_TOKEN: z.string().optional(),
    WHATSAPP_TOKEN: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),

    /* ── Administration & Observability ────────────────────────────── */
    // The shared secret that gates the admin API. Read directly by AdminGuard,
    // which fails closed in production if it is unset — so admin mutations are
    // refused rather than silently open. Optional here because a deploy without an
    // operator console is valid; the guard, not the schema, enforces the boundary.
    ADMIN_API_TOKEN: z.string().optional(),
    // Stamped into /health/info and the admin build panel so an operator can tell
    // exactly which commit is running. Injected by CI/Coolify at build time.
    GIT_COMMIT: z.string().optional(),
    // Hardening limits, overridable per-environment (see bootstrap.ts).
    HTTP_BODY_LIMIT: z.string().optional(),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  })
  /**
   * Production tightens the screws.
   *
   * A development placeholder that reaches production is not a typo, it is an
   * incident. Fail at boot, loudly, where it is cheap.
   */
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    const placeholders = ["changeme", "secret", "development", "test", "local"];
    if (placeholders.some((p) => env.JWT_SECRET.toLowerCase().includes(p))) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message:
          "JWT_SECRET looks like a development placeholder. Generate a real one.",
      });
    }

    if (env.APP_URL.includes("localhost")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL cannot point at localhost in production",
      });
    }

    /*
     * A production deploy with an unguarded admin surface is not a valid state. The
     * guard already fails closed at request time, but catching it at boot turns a
     * silent "admin does nothing" into a loud "fix your config" — the cheaper place
     * to learn it. A blank token is not a token.
     */
    if (!env.ADMIN_API_TOKEN || env.ADMIN_API_TOKEN.length < 24) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_API_TOKEN"],
        message:
          "ADMIN_API_TOKEN must be set to a strong secret (24+ chars) in production — " +
          "the admin API is refused without it.",
      });
    }

    /*
     * A DNS override is a workaround for a filtered development network. In
     * production it is a third party we did not choose, sitting in front of every
     * exchange we depend on — and if it goes down, so does our market data.
     */
    if (env.EXCHANGE_DNS_SERVERS) {
      ctx.addIssue({
        code: "custom",
        path: ["EXCHANGE_DNS_SERVERS"],
        message:
          "EXCHANGE_DNS_SERVERS is a development escape hatch for ISP-level DNS " +
          "filtering. Unset it in production and use the host's resolver.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validate on boot. Called by ConfigModule before anything else exists.
 *
 * Throws with every problem listed at once — a config error that reveals itself
 * one variable per restart is a bad afternoon.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  · ${i.path.join(".") || "(root)"} — ${i.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment. The application will not start.\n\n${problems}\n\n` +
        `See apps/api/.env.example for the full list.\n`,
    );
  }

  return result.data;
}
