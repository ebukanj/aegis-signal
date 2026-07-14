import { z } from "zod";

/**
 * Platform enums — the vocabulary that is not about a trade.
 *
 * Domain enums (direction, risk level, market condition, timeframe) live in
 * `domain.ts` and are older than this file; they are consumed by a shipped
 * frontend and enforced by tests, and they are not moved here for the sake of
 * tidiness. A refactor that breaks working code to satisfy a folder diagram is
 * not a refactor.
 */

/* ── Exchanges ─────────────────────────────────────────────────────── */

/**
 * Venues the platform scans.
 *
 * A closed enum, not a string. An exchange the market module has no adapter for
 * is not a typo to be tolerated — it is a signal on a venue we cannot actually
 * read, which is a signal we cannot honour.
 */
export const exchangeIdSchema = z.enum([
  "BINANCE",
  "BYBIT",
  "OKX",
  "BITGET",
  "KUCOIN",
]);
export type ExchangeId = z.infer<typeof exchangeIdSchema>;

/** Display names. The enum is the identity; this is the label. */
export const EXCHANGE_LABEL: Record<ExchangeId, string> = {
  BINANCE: "Binance",
  BYBIT: "Bybit",
  OKX: "OKX",
  BITGET: "Bitget",
  KUCOIN: "KuCoin",
};

/* ── Strategy lifecycle ────────────────────────────────────────────── */

/**
 * Where a strategy is in its life.
 *
 * Distinct from `enabled`, which is the user's switch. A strategy can be ACTIVE
 * and switched off; it cannot be ARCHIVED and switched on.
 *
 * DISABLED here means *the platform* disabled it — rolling expectancy went
 * negative and the auto-disable fired (06-STRATEGIES §5). That is not the same
 * event as a user flipping a toggle, and conflating them would hide the most
 * important thing a strategy can tell you: that it stopped working.
 */
export const strategyStatusSchema = z.enum([
  /** Being written. Cannot produce signals. */
  "DRAFT",
  /** Live and evaluating. */
  "ACTIVE",
  /** Auto-disabled by the platform — expectancy turned negative. */
  "DISABLED",
  /** Retired by the user. Kept for its history; never evaluated again. */
  "ARCHIVED",
]);
export type StrategyStatus = z.infer<typeof strategyStatusSchema>;

/* ── Notifications ─────────────────────────────────────────────────── */

export const notificationChannelSchema = z.enum([
  "TELEGRAM",
  "WHATSAPP",
  "EMAIL",
  "PUSH",
  "IN_APP",
]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationStatusSchema = z.enum([
  "QUEUED",
  "SENT",
  "DELIVERED",
  "FAILED",
]);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

/* ── Workers ───────────────────────────────────────────────────────── */

export const workerStatusSchema = z.enum([
  "IDLE",
  "RUNNING",
  "FAILED",
  "STOPPED",
]);
export type WorkerStatus = z.infer<typeof workerStatusSchema>;

/* ── Users ─────────────────────────────────────────────────────────── */

export const userRoleSchema = z.enum([
  "SUPER_ADMIN",
  "ADMIN",
  "ANALYST",
  "TRADER",
  "VIEWER",
]);
export type UserRole = z.infer<typeof userRoleSchema>;
