import { z } from "zod";
import { marketTypeSchema, riskLevelSchema, signalDirectionSchema } from "../domain";
import { rejectionGateSchema } from "../enums/lifecycle";
import {
  leverageSchema,
  moneySchema,
  priceSchema,
  quantitySchema,
  ratioSchema,
  timestampSchema,
} from "../common/value-objects";

/**
 * Risk — the veto.
 *
 * Every one of these shapes is produced by the Risk Engine and by nothing else.
 * Not the frontend, not the AI layer, not a strategy. If a number a trader acts
 * on is computed anywhere but there, that is an architecture violation
 * (AGENTS.md §6).
 *
 * The Risk Engine's power to say NO is not an obstacle to the product. It IS the
 * product — "Protect the Trader" is this module, expressed as code.
 */

/* ── Position sizing ───────────────────────────────────────────────── */

/**
 * How much to put on.
 *
 *     PositionSize = (Equity × Risk%) / |Entry − Stop|
 *
 * **Risk is defined by the stop distance, never by the leverage.** Leverage only
 * decides the margin you post. A trader who sizes by leverage is a trader who has
 * no idea what they stand to lose, and that is not a style difference — it is the
 * mechanism by which accounts die.
 */
export const positionSizingSchema = z
  .object({
    equity: moneySchema,
    /** Percent of equity risked if the stop is hit. */
    riskPercent: z.number().positive().max(10),
    /** What that percent is, in money. */
    riskAmount: moneySchema,

    entryPrice: priceSchema,
    stopLoss: priceSchema,
    /** |entry − stop|, as a percent of entry. */
    stopDistancePercent: z.number().positive(),

    /** The answer. */
    quantity: quantitySchema,
    notional: moneySchema,

    /** Null for spot. */
    leverage: leverageSchema.nullable(),
    /** notional / leverage. What you actually post. */
    marginRequired: moneySchema.nullable(),
  })
  .refine((p) => p.leverage !== null || p.marginRequired === null, {
    message: "Spot has no leverage and therefore no margin requirement",
    path: ["marginRequired"],
  });
export type PositionSizing = z.infer<typeof positionSizingSchema>;

/**
 * Leverage, and the reason it was capped where it was.
 *
 * `liquidationBeforeStop` is the single most valuable field in this file.
 *
 * If leverage is high enough that the exchange closes the position BEFORE the
 * stop is reached, the stop is decoration: the account is gone before the trade
 * is even proven wrong. It is the most expensive mistake in leveraged trading and
 * most platforms will happily let a user make it.
 *
 * **The Risk Engine must never suggest a leverage for which this is true.** The
 * field exists so the rule is checkable rather than merely intended.
 */
export const leverageRecommendationSchema = z
  .object({
    suggested: leverageSchema,
    /** The hard ceiling for this risk level. */
    maxAllowed: leverageSchema,
    /** Estimated. The exchange's own margin rules are authoritative. */
    liquidationPrice: priceSchema,
    /** Must be false on anything the engine suggests. */
    liquidationBeforeStop: z.boolean(),
    /** How far liquidation sits beyond the stop, in units of risk. Want ≥ 1.5. */
    liquidationBufferR: z.number(),
    reason: z.string(),
  })
  .refine((l) => !l.liquidationBeforeStop, {
    message:
      "The Risk Engine must never suggest a leverage at which liquidation precedes the stop — the stop would be decoration",
    path: ["suggested"],
  })
  .refine((l) => l.suggested <= l.maxAllowed, {
    message: "Suggested leverage cannot exceed the cap for this risk level",
    path: ["suggested"],
  });
export type LeverageRecommendation = z.infer<
  typeof leverageRecommendationSchema
>;

/* ── Assessment ────────────────────────────────────────────────────── */

/** One thing that makes this trade riskier or safer, and what it measured. */
export const riskFactorSchema = z.object({
  name: z.string(),
  rating: riskLevelSchema,
  /** The measured value. "spread 0.031%", not "spread is fine". */
  measured: z.string(),
  note: z.string(),
  /**
   * False when the platform cannot see this yet — funding and open interest,
   * until the derivatives feed exists. A missing measurement must read as
   * *missing*, never as *fine*.
   */
  available: z.boolean(),
});
export type RiskFactor = z.infer<typeof riskFactorSchema>;

/** The portfolio-level ceilings. New signals queue when these are hit. */
export const riskLimitsSchema = z.object({
  /** Total open risk as a percent of equity. Cap: 4%. */
  portfolioHeatPercent: ratioSchema,
  portfolioHeatCap: ratioSchema,
  /** Open positions correlated above 0.8 to each other. Cap: 3. */
  correlatedPositions: z.number().int().nonnegative(),
  correlatedPositionCap: z.number().int().positive(),
  openPositions: z.number().int().nonnegative(),
});
export type RiskLimits = z.infer<typeof riskLimitsSchema>;

export const riskAssessmentSchema = z.object({
  level: riskLevelSchema,
  /** 0–100 aggregate exposure heat. */
  score: ratioSchema,
  factors: z.array(riskFactorSchema),
  limits: riskLimitsSchema,
  warnings: z.array(z.string()),
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

/* ── The decision ──────────────────────────────────────────────────── */

/**
 * The Risk Engine's verdict on one candidate.
 *
 * A REJECTED decision carries the gate it died at and the *measured* reason —
 * "spread 0.081% > 0.05% limit", never bare "rejected". The Scanner renders
 * these, and they are what make a quiet day credible instead of suspicious.
 * Silence without evidence is indistinguishable from a broken feed.
 */
export const riskDecisionSchema = z
  .object({
    approved: z.boolean(),

    /** Present when approved. The execution guidance the trader acts on. */
    direction: signalDirectionSchema.optional(),
    marketType: marketTypeSchema.optional(),
    leverage: leverageRecommendationSchema.nullable().optional(),
    sizing: positionSizingSchema.optional(),
    assessment: riskAssessmentSchema.optional(),

    /** Present when rejected. Which gate, and what it measured. */
    gate: rejectionGateSchema.optional(),
    reason: z.string().optional(),

    decidedAt: timestampSchema,
  })
  .refine((d) => d.approved === (d.gate === undefined), {
    message:
      "A rejected decision must name the gate it died at; an approved one has no gate",
    path: ["gate"],
  })
  .refine((d) => !d.approved || d.assessment !== undefined, {
    message: "An approved decision must carry its risk assessment",
    path: ["assessment"],
  })
  .refine((d) => d.approved || (d.reason?.length ?? 0) > 0, {
    message:
      "A rejection without a measured reason is not evidence — it tells a trader nothing",
    path: ["reason"],
  })
  .refine(
    (d) => d.marketType !== "SPOT" || d.direction !== "SHORT",
    {
      message: "A SHORT must be PERPETUAL — spot cannot be shorted",
      path: ["marketType"],
    },
  );
export type RiskDecision = z.infer<typeof riskDecisionSchema>;
