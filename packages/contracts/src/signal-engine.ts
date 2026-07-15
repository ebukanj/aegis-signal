import { z } from "zod";
import {
  marketRegimeSchema,
  marketTypeSchema,
  signalDirectionSchema,
  signalStatusSchema,
  timeframeSchema,
} from "./domain";
import { exchangeIdSchema } from "./enums/platform";
import { rejectionGateSchema } from "./enums/lifecycle";
import { epochMsSchema, priceSchema, symbolSchema } from "./common/value-objects";
import { calibratedConfidenceSchema } from "./confidence";

/**
 * The SIGNAL ENGINE's own shapes — the publisher's vocabulary.
 *
 * ── The one distinction this whole file turns on ──
 *
 * CONFIDENCE and CONFLUENCE are not the same thing, and a platform that conflates
 * them is a platform that double-counts its own evidence.
 *
 *   CONFIDENCE (owned by the Confidence Engine, M09) answers *"how much historical
 *   evidence says a score like this wins?"* — a probability, earned from outcomes.
 *
 *   CONFLUENCE (owned here) answers *"how much does the evidence AGREE with
 *   itself, right now?"* — a coherence measure, computed from what the upstream
 *   engines already produced. It reads the risk factors, the confidence
 *   contributors, the multi-timeframe alignment and the patterns, and asks whether
 *   they all point the same way. It **recomputes nothing.**
 *
 * A trade can have high confluence (everything lines up) and low confidence (we
 * have no history to say whether setups like it win). They are orthogonal, and the
 * Signal Engine uses confluence for RANKING and confidence for the win rate it
 * shows. Neither is allowed to masquerade as the other.
 */

/* ── Confluence: how much the evidence agrees ──────────────────────── */

/**
 * One dimension of agreement.
 *
 * `agrees` is the signed contribution: positive when this dimension supports the
 * trade, negative when it argues against it. A confluence report with only
 * positive contributors is a sales pitch; the negative ones are what make it an
 * honest measure of coherence.
 */
export const confluenceContributorSchema = z.object({
  name: z.string(),
  /** 0–1, how much this dimension MATTERS to the agreement measure. */
  weight: z.number().min(0).max(1),
  /** −1…+1, which way this dimension points and how strongly. */
  agrees: z.number().min(-1).max(1),
  /** The already-computed fact this reads. "3 of 3 timeframes aligned." */
  measured: z.string(),
});
export type ConfluenceContributor = z.infer<typeof confluenceContributorSchema>;

export const confluenceReportSchema = z.object({
  /** 0–100. The weighted agreement of every dimension. NOT a probability. */
  score: z.number().min(0).max(100),
  contributors: z.array(confluenceContributorSchema),

  /**
   * How many INDEPENDENT strategies agreed on this exact opportunity.
   *
   * 1 is the degenerate, common case (ADR-021 §1) — a lone strategy is not less
   * valid, it simply has no cross-strategy corroboration. > 1 is true confluence:
   * strategies that never communicate arrived at the same conclusion separately.
   */
  agreeingStrategies: z.array(z.string()).min(1),

  /**
   * The confluence UPLIFT applied to confidence. Zero until the ledger prices it.
   *
   * ADR-024 §6, verbatim in spirit: the uplift is derived from historical
   * confluence performance, and *until there is data, the uplift is zero.* A
   * platform that paid points for agreement it had never measured winning would be
   * reinventing the `+4 per strategy` lie this codebase was built to delete.
   */
  uplift: z.number(),
});
export type ConfluenceReport = z.infer<typeof confluenceReportSchema>;

/* ── The signal quality score: for RANKING only ────────────────────── */

/**
 * One number to order candidates by — and nothing else.
 *
 * ── Why this is not shown to a trader ──
 *
 * It blends confluence, confidence, risk and freshness into a single ordering
 * key, and a blend like that is exactly the kind of opaque composite the platform
 * refuses to put in front of a user. Averaging a 90% win rate against a 0.3 risk
 * heat produces a number that means nothing on its own — but it is a perfectly
 * good way to decide which of two signals is stronger.
 *
 * So it exists, it is deterministic, and it stays backstage. The trader sees the
 * confidence, the confluence and the risk SEPARATELY, each with its own working.
 */
export const signalScoreSchema = z.object({
  total: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  confluence: z.number().min(0).max(100),
  /** Inverted risk heat — a clean trade scores higher. */
  riskQuality: z.number().min(0).max(100),
  /** Decays as the setup ages away from the bar it fired on. */
  freshness: z.number().min(0).max(100),
});
export type SignalScore = z.infer<typeof signalScoreSchema>;

/* ── The published signal ──────────────────────────────────────────── */

/**
 * The reason a signal was published, or the reason it was not.
 *
 * Silence is a feature (AGENTS.md §1), but only a silence that can EXPLAIN itself.
 * A signal that was suppressed carries the gate it died at and the measurement, so
 * a quiet day is auditable rather than merely quiet.
 */
export const publicationDecisionSchema = z.discriminatedUnion("published", [
  z.object({
    published: z.literal(true),
    isPrime: z.boolean(),
    reason: z.string(),
  }),
  z.object({
    published: z.literal(false),
    gate: rejectionGateSchema,
    reason: z.string(),
  }),
]);
export type PublicationDecision = z.infer<typeof publicationDecisionSchema>;

/**
 * A PUBLISHED signal — the single output of the platform (AGENTS.md §1).
 *
 * Everything before this milestone produced evidence. This is the thing a trader
 * finally sees: risk-validated, confidence-calibrated, explainable, executable,
 * and — the part that makes it rare — selected. Most candidates never become one.
 *
 * It is APPEND-ONLY. A published signal is never edited and never deleted; its
 * lifecycle advances (its `status` changes) but the trade it described is a matter
 * of record the moment it is published, because a track record you can revise is
 * not a track record (06-STRATEGIES §5).
 */
export const publishedSignalSchema = z
  .object({
    id: z.string(),

    symbol: symbolSchema,
    exchange: exchangeIdSchema,
    timeframe: timeframeSchema,
    direction: signalDirectionSchema,

    /**
     * Every strategy that agreed, primary first. Length > 1 is confluence: two
     * independent plugins reached the same conclusion without ever talking to each
     * other (ADR-021 §1, Founding Principle 4).
     */
    strategies: z.array(z.string()).min(1),
    /** The exact rules that fired, per strategy. A settled trade traces to these. */
    rulesHashes: z.array(z.string()).min(1),

    regime: marketRegimeSchema,

    /* ── Execution guidance (from the Risk Engine, never recomputed) ── */
    marketType: marketTypeSchema,
    suggestedLeverage: z.number().int().positive().nullable(),
    entryPrice: priceSchema,
    stopLoss: priceSchema,
    takeProfits: z.array(priceSchema).min(1),

    /* ── The three separate measures, each with its own provenance ─── */
    confidence: calibratedConfidenceSchema,
    confluence: confluenceReportSchema,
    signalScore: signalScoreSchema,

    /** Prime is the day's few elite slots (ADR-021 §2). Immutable once awarded. */
    isPrime: z.boolean(),

    /* ── Lifecycle ─────────────────────────────────────────────────── */
    status: signalStatusSchema,
    barTime: epochMsSchema,
    publishedAt: epochMsSchema,
    /** Past this, the setup no longer describes the market. Never outlives it. */
    expiresAt: epochMsSchema,

    /* ── Explainability ────────────────────────────────────────────── */
    summary: z.string(),
    whyPublished: z.string(),
    supporting: z.array(z.string()),
    contradicting: z.array(z.string()),
    unassessed: z.array(z.string()),

    /** Which calibration model produced the confidence. Immutable, stored forever. */
    calibrationVersion: z.number().int().nonnegative(),
  })
  .refine((s) => s.marketType !== "SPOT" || s.direction !== "SHORT", {
    message: "A SHORT must be PERPETUAL — spot cannot be shorted",
    path: ["marketType"],
  })
  .refine((s) => s.marketType === "PERPETUAL" || s.suggestedLeverage === null, {
    message: "Spot has no leverage",
    path: ["suggestedLeverage"],
  })
  .refine(
    (s) =>
      s.direction === "LONG" ? s.stopLoss < s.entryPrice : s.stopLoss > s.entryPrice,
    {
      message: "A LONG stops below its entry and a SHORT stops above",
      path: ["stopLoss"],
    },
  )
  .refine(
    (s) =>
      s.takeProfits.every((tp) =>
        s.direction === "LONG" ? tp > s.entryPrice : tp < s.entryPrice,
      ),
    {
      message: "Every target must sit beyond entry in the direction of the trade",
      path: ["takeProfits"],
    },
  )
  .refine((s) => s.strategies.length === s.rulesHashes.length, {
    message: "Every crediting strategy must carry the exact rules that fired",
    path: ["rulesHashes"],
  })
  .refine((s) => s.expiresAt > s.publishedAt, {
    message: "A signal that expires before it is published never existed",
    path: ["expiresAt"],
  });
export type PublishedSignal = z.infer<typeof publishedSignalSchema>;

/* ── The prime budget, as an auditable ledger ──────────────────────── */

/**
 * The day's Prime budget, spent and remaining.
 *
 * Prime is scarce ON PURPOSE (ADR-021 §2): 4–5 a day, not a feed. The budget is a
 * ledger rather than a counter so that "why was this not Prime?" always has an
 * answer — the slots were spent, here is on what, in rank order.
 */
export const primeBudgetSchema = z.object({
  day: z.string(),
  total: z.number().int().nonnegative(),
  awarded: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  /** The signals that took the slots, in the order they took them. */
  slots: z.array(
    z.object({
      signalId: z.string(),
      symbol: symbolSchema,
      score: z.number(),
      awardedAt: epochMsSchema,
    }),
  ),
});
export type PrimeBudget = z.infer<typeof primeBudgetSchema>;
