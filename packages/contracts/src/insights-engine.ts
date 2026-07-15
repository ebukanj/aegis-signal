import { z } from "zod";
import { timestampSchema } from "./domain";
import { epochMsSchema } from "./common/value-objects";

/**
 * The Insights Engine — the eyes and ears of the platform.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  CONTEXT, NEVER A DECISION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The other engines analyse the market itself. This one analyses the WORLD AROUND
 * the market. It answers four questions and refuses a fifth:
 *
 *   What happened?  ·  Who is affected?  ·  How severe?  ·  Is it relevant?
 *
 * It never answers "should we buy?". A story about a coin is a reason to LOOK, not
 * a reason to act — every trade still comes from a strategy document evaluated
 * deterministically (ADR-023). The one thing insights may DO is the opposite of
 * buying: raise a Risk Flag that STOPS a trade (ADR-023 §5, "Protect the Trader").
 * Awareness, and a veto. Nothing between.
 *
 * Everything on this page is DETERMINISTIC. The same article always classifies the
 * same way — no AI, no sentiment model, no price forecast. "Impact" is market
 * RELEVANCE (does this tend to matter?), never a prediction of direction with
 * money on it. A rule you can read is a rule you can trust; a black box that says
 * "bearish" is the thing this platform exists not to be.
 */

/* ── The canonical vocabulary ──────────────────────────────────────── */

/** What KIND of event. Deterministic, from the story's own words. */
export const insightCategorySchema = z.enum([
  "EXCHANGE",
  "PROTOCOL",
  "MACRO",
  "REGULATION",
  "SECURITY",
  "PARTNERSHIP",
  "LISTING",
  "DELISTING",
  "MAINTENANCE",
  "HACK",
  "EXPLOIT",
  "GOVERNANCE",
  "TOKENOMICS",
  "LIQUIDITY",
  "INFRASTRUCTURE",
  "TECHNOLOGY",
  /** Nothing matched a rule. Reported as unknown, never guessed into a category. */
  "GENERAL",
]);
export type InsightCategory = z.infer<typeof insightCategorySchema>;

/** How much a trader should care. */
export const insightSeveritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFORMATIONAL",
]);
export type InsightSeverity = z.infer<typeof insightSeveritySchema>;

/**
 * Likely market RELEVANCE — not a price prediction.
 *
 * POSITIVE / NEGATIVE mean "events like this tend to matter in this direction",
 * derived from the category (a hack is negative; a major listing is positive).
 * NEUTRAL is a real, common answer. UNKNOWN is the honest one when nothing in the
 * story says — and it is never quietly promoted to NEUTRAL, because "we could not
 * tell" and "it does not matter" are different facts.
 */
export const insightImpactSchema = z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"]);
export type InsightImpact = z.infer<typeof insightImpactSchema>;

/* ── Entities ──────────────────────────────────────────────────────── */

export const entityKindSchema = z.enum([
  "COIN",
  "EXCHANGE",
  "PROJECT",
  "PROTOCOL",
  "STABLECOIN",
  "CHAIN",
  "SECTOR",
]);
export type EntityKind = z.infer<typeof entityKindSchema>;

/** A thing a story is about, identified structurally rather than by free text. */
export const insightEntitySchema = z.object({
  kind: entityKindSchema,
  /** The canonical symbol/ticker where one exists (BTC, ETH), else the slug. */
  symbol: z.string(),
  name: z.string(),
});
export type InsightEntity = z.infer<typeof insightEntitySchema>;

/* ── The normalized insight ────────────────────────────────────────── */

/**
 * One piece of intelligence, normalized. **No provider-specific format may escape
 * the normalization layer** — everything downstream sees this shape and only this
 * shape, so a new source is a new collector and nothing else changes.
 *
 * `dedupeKey` is how the same story from three outlets becomes one insight: a
 * stable fingerprint of the normalized title. `sources` then carries every outlet
 * that ran it, so the corroboration a Risk Flag needs is preserved even after the
 * merge.
 */
export const insightSchema = z.object({
  id: z.string(),

  /** The collector that produced it, e.g. "cointelegraph". */
  provider: z.string(),
  /** The human-facing source name, e.g. "Cointelegraph". */
  source: z.string(),
  /** Every outlet that carried this same story after deduplication. */
  sources: z.array(z.string()).min(1),

  title: z.string(),
  description: z.string(),
  url: z.string().nullable(),
  language: z.string(),

  /** Epoch ms — used numerically downstream (min, compare), not as a display string. */
  publishedAt: epochMsSchema,
  collectedAt: epochMsSchema,

  category: insightCategorySchema,
  severity: insightSeveritySchema,
  impact: insightImpactSchema,

  entities: z.array(insightEntitySchema),
  /** The coin symbols this concerns, denormalised from entities for fast filtering. */
  coins: z.array(z.string()),
  tags: z.array(z.string()),

  /**
   * How confident the CLASSIFICATION is, 0–1 — NOT a trade confidence and never
   * consumed as one. Low when the category came from a weak keyword match; high
   * when the story is unambiguous. It measures the engine's certainty about what
   * KIND of event this is, nothing more.
   */
  confidence: z.number().min(0).max(1),

  /** The fingerprint that merges the same story across outlets. */
  dedupeKey: z.string(),
});
export type Insight = z.infer<typeof insightSchema>;

/* ── Collector health ──────────────────────────────────────────────── */

/**
 * Whether a source is actually working.
 *
 * A dead collector is the failure that never announces itself — the feed simply
 * goes quiet, and quiet looks exactly like "no news" until a trader misses the one
 * story that mattered. So health is tracked and surfaced: last success, last error,
 * consecutive failures. A source that has failed repeatedly is DEGRADED, loudly.
 */
export const collectorHealthSchema = z.object({
  provider: z.string(),
  status: z.enum(["HEALTHY", "DEGRADED", "DOWN"]),
  lastSuccessAt: timestampSchema.nullable(),
  lastErrorAt: timestampSchema.nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  itemsLastRun: z.number().int().nonnegative(),
});
export type CollectorHealth = z.infer<typeof collectorHealthSchema>;

/* ── Read shapes ───────────────────────────────────────────────────── */

/** A filterable historical timeline of insights. */
export const insightTimelineSchema = z.object({
  scope: z.enum(["ASSET", "EXCHANGE", "MACRO", "PROJECT", "ALL"]),
  key: z.string().nullable(),
  items: z.array(insightSchema),
});
export type InsightTimeline = z.infer<typeof insightTimelineSchema>;

/** Everything the platform currently knows about one asset's context. */
export const assetContextSchema = z.object({
  coin: z.string(),
  recentNews: z.array(insightSchema),
  activeRiskFlags: z.array(z.string()),
  upcomingEvents: z.array(insightSchema),
});
export type AssetContext = z.infer<typeof assetContextSchema>;
