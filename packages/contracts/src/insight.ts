import { z } from "zod";
import { timestampSchema } from "./domain";

/**
 * Insights — news, social, fundamentals, and the Risk Flags that veto trades.
 *
 * The single most important rule on this page, and it is a hard one:
 *
 *   **INSIGHTS NEVER CREATE A SIGNAL.**
 *
 * Narrative finds a candidate; the chart must agree (Founding Principle 9 — AI
 * assists, AI does not decide). A story about a coin is a reason to *look*, not
 * a reason to *buy*. Every signal still comes from a strategy document evaluated
 * deterministically (ADR-023). Nothing here bypasses that.
 *
 * What insights *may* do is the opposite: **stop** a trade. A Risk Flag is a
 * veto, and vetoes belong to the Risk Engine. If a coin was just exploited, no
 * strategy gets to have an opinion about it — that is "Protect the Trader"
 * expressed as code, and it is the half of Oracle that should never have been a
 * strategy in the first place (ADR-023 §5).
 */

/* ── Risk Flags — the veto ─────────────────────────────────────────── */

export const riskFlagKindSchema = z.enum([
  "EXPLOIT",
  "DEPEG",
  "DELISTING",
  "REGULATORY",
  "OUTAGE",
  "UNLOCK",
]);
export type RiskFlagKind = z.infer<typeof riskFlagKindSchema>;

/**
 * An active block on an asset. While one of these exists, NO strategy may emit
 * a signal on that coin — enabled, proven, confluent, it does not matter.
 *
 * Requires two independent tier-1 sources before it can fire, because a false
 * veto costs a trader opportunity and a missed one costs them everything.
 */
export const riskFlagSchema = z.object({
  id: z.string(),
  coin: z.string(),
  kind: riskFlagKindSchema,
  headline: z.string(),
  detail: z.string(),
  /** Independent tier-1 sources corroborating this. Two is the minimum to fire. */
  sources: z.array(z.string()).min(2),
  raisedAt: timestampSchema,
  /** Signals stay blocked until this moment. */
  blockedUntil: timestampSchema,
});
export type RiskFlag = z.infer<typeof riskFlagSchema>;

/* ── News ──────────────────────────────────────────────────────────── */

/** How much a headline is worth. Tier 1 is an official or primary source. */
export const sourceTierSchema = z.enum(["TIER_1", "TIER_2", "TIER_3"]);
export type SourceTier = z.infer<typeof sourceTierSchema>;

export const newsImpactSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export type NewsImpact = z.infer<typeof newsImpactSchema>;

export const newsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string(),
  source: z.string(),
  tier: sourceTierSchema,
  /** Coins this story actually concerns. Empty means market-wide. */
  coins: z.array(z.string()),
  impact: newsImpactSchema,
  publishedAt: timestampSchema,
  url: z.string().nullable(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

/* ── Social ────────────────────────────────────────────────────────── */

/**
 * A spike in chatter — and, far more usefully, whether it is real.
 *
 * `astroturfRatio` is the share of the spike coming from accounts younger than
 * 90 days or posting more than 50 times a day. Above 40% the platform treats the
 * spike as manufactured and blocks any signal built on it. A pump needs a crowd,
 * and a manufactured crowd is how retail gets used as exit liquidity.
 */
export const socialSignalSchema = z
  .object({
    id: z.string(),
    coin: z.string(),
    /** Standard deviations above the 30-day mention baseline. */
    mentionZScore: z.number(),
    /** Engagement-weighted sentiment, −1 (fear) to +1 (euphoria). */
    sentiment: z.number().min(-1).max(1),
    /** 0–100. Above 40 the spike is treated as manufactured. */
    astroturfRatio: z.number().min(0).max(100),
    /** True when at least two independent credible accounts carry it. */
    corroborated: z.boolean(),
    topNarrative: z.string(),
    at: timestampSchema,
  })
  .refine((s) => s.astroturfRatio <= 40 || !s.corroborated, {
    message:
      "A spike above the 40% astroturf threshold cannot be marked corroborated",
    path: ["corroborated"],
  });
export type SocialSignal = z.infer<typeof socialSignalSchema>;

/* ── Fundamentals ──────────────────────────────────────────────────── */

export const fundamentalKindSchema = z.enum([
  /** Coins leaving exchanges — historically accumulation. */
  "EXCHANGE_OUTFLOW",
  /** Coins arriving at exchanges — historically distribution. */
  "EXCHANGE_INFLOW",
  "WHALE_ACCUMULATION",
  "WHALE_DISTRIBUTION",
  "DEV_ACTIVITY",
  "TVL_CHANGE",
]);
export type FundamentalKind = z.infer<typeof fundamentalKindSchema>;

export const fundamentalSignalSchema = z.object({
  id: z.string(),
  coin: z.string(),
  kind: fundamentalKindSchema,
  headline: z.string(),
  /** The measured value. Never a vibe: "−$18M netflow (24h)". */
  measured: z.string(),
  bullish: z.boolean(),
  at: timestampSchema,
});
export type FundamentalSignal = z.infer<typeof fundamentalSignalSchema>;

/* ── The AI summary ────────────────────────────────────────────────── */

/**
 * The AI's read of the market, in prose.
 *
 * It explains; it never decides (Founding Principle 9). It cannot create a
 * signal, cannot alter a score, cannot set leverage. It exists so a trader can
 * understand the weather — and it must be labelled as AI wherever it appears,
 * so nobody mistakes a summary for an instruction.
 */
export const marketSummarySchema = z.object({
  summary: z.string(),
  /** What the AI is watching. Observations, never orders. */
  watching: z.array(z.string()),
  generatedAt: timestampSchema,
  model: z.string(),
});
export type MarketSummary = z.infer<typeof marketSummarySchema>;

export const insightsFeedSchema = z.object({
  riskFlags: z.array(riskFlagSchema),
  summary: marketSummarySchema,
  news: z.array(newsItemSchema),
  social: z.array(socialSignalSchema),
  fundamentals: z.array(fundamentalSignalSchema),
});
export type InsightsFeed = z.infer<typeof insightsFeedSchema>;
