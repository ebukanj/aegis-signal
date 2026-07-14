import { z } from "zod";
import { marketRegimeSchema } from "../domain";
import { workerStatusSchema } from "../enums/platform";
import { rejectionGateSchema } from "../enums/lifecycle";
import { opportunitySchema } from "../scanner";
import {
  confidenceSchema,
  pairSchema,
  priceSchema,
  timestampSchema,
  uuidSchema,
} from "../common/value-objects";

/**
 * WebSocket messages.
 *
 * Every message is discriminated by `channel` + `type`, so a client switching on
 * them gets exhaustiveness for free. An unhandled message type becomes a compile
 * error rather than a silently dropped update — and a silently dropped price
 * update on a trading terminal is a stale number a trader acts on.
 */

export const WS_CHANNEL = {
  MARKET: "market",
  SIGNALS: "signals",
  PRIME: "prime",
  SCANNER: "scanner",
  NOTIFICATIONS: "notifications",
  HEALTH: "health",
  ADMIN: "admin",
} as const;

export type WsChannel = (typeof WS_CHANNEL)[keyof typeof WS_CHANNEL];

const base = {
  at: timestampSchema,
};

/* ── Market ────────────────────────────────────────────────────────── */

/**
 * A live price tick.
 *
 * The frontend renders this against a signal's published entry to decide whether
 * the trade is still there. A signal saying "enter near $145.30" is worthless
 * once price is at $149 — chasing it buys a worse reward-to-risk than the one we
 * promised (ADR-024).
 */
export const priceTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.MARKET),
  type: z.literal("price"),
  pair: pairSchema,
  price: priceSchema,
  changePercent24h: z.number(),
});
export type PriceTick = z.infer<typeof priceTickSchema>;

export const marketConditionTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.MARKET),
  type: z.literal("condition"),
  condition: marketRegimeSchema,
  suppressedStrategies: z.array(z.string()),
});
export type MarketConditionTick = z.infer<typeof marketConditionTickSchema>;

/* ── Signals ───────────────────────────────────────────────────────── */

export const signalPublishedTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.SIGNALS),
  type: z.literal("published"),
  signal: opportunitySchema,
});
export type SignalPublishedTick = z.infer<typeof signalPublishedTickSchema>;

/** A signal reached its stop, its target, or expired. */
export const signalSettledTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.SIGNALS),
  type: z.literal("settled"),
  signalId: uuidSchema,
  outcome: z.enum(["WIN", "LOSS", "BREAKEVEN"]),
  realisedR: z.number(),
});
export type SignalSettledTick = z.infer<typeof signalSettledTickSchema>;

/** The only channel that should ever wake a phone (ADR-021). */
export const primeTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.PRIME),
  type: z.literal("awarded"),
  signal: opportunitySchema,
  slot: z.number().int().positive(),
  budgetTotal: z.number().int().positive(),
  confidence: confidenceSchema,
});
export type PrimeTick = z.infer<typeof primeTickSchema>;

/* ── Scanner ───────────────────────────────────────────────────────── */

/**
 * A rejection, live.
 *
 * Streaming the rejections is what makes a quiet day watchable. A trader sees the
 * machine looking and throwing things away, with a measured reason on each — and
 * silence stops looking like a broken feed.
 */
export const scanRejectionTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.SCANNER),
  type: z.literal("rejected"),
  pair: pairSchema,
  strategy: z.string(),
  gate: rejectionGateSchema,
  reason: z.string().min(1),
});
export type ScanRejectionTick = z.infer<typeof scanRejectionTickSchema>;

export const scanProgressTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.SCANNER),
  type: z.literal("progress"),
  pairsChecked: z.number().int().nonnegative(),
  pairsTotal: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
});
export type ScanProgressTick = z.infer<typeof scanProgressTickSchema>;

/* ── Platform ──────────────────────────────────────────────────────── */

export const healthTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.HEALTH),
  type: z.literal("status"),
  database: z.enum(["up", "down"]),
  redis: z.enum(["up", "down"]),
  exchanges: z.record(z.string(), z.enum(["up", "down"])),
});
export type HealthTick = z.infer<typeof healthTickSchema>;

export const workerTickSchema = z.object({
  ...base,
  channel: z.literal(WS_CHANNEL.ADMIN),
  type: z.literal("worker"),
  worker: z.string(),
  status: workerStatusSchema,
  queueDepth: z.number().int().nonnegative(),
});
export type WorkerTick = z.infer<typeof workerTickSchema>;

/* ── The union ─────────────────────────────────────────────────────── */

export const wsMessageSchema = z.discriminatedUnion("type", [
  priceTickSchema,
  marketConditionTickSchema,
  signalPublishedTickSchema,
  signalSettledTickSchema,
  primeTickSchema,
  scanRejectionTickSchema,
  scanProgressTickSchema,
  healthTickSchema,
  workerTickSchema,
]);
export type WsMessage = z.infer<typeof wsMessageSchema>;

/** What a client sends to subscribe. */
export const wsSubscribeSchema = z.object({
  action: z.literal("subscribe"),
  channels: z.array(z.enum(Object.values(WS_CHANNEL))).min(1),
  /** Optional filter — only these pairs. Empty means all. */
  pairs: z.array(pairSchema).optional(),
});
export type WsSubscribe = z.infer<typeof wsSubscribeSchema>;
