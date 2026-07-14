import { z } from "zod";

/**
 * A signal's journey through the pipeline.
 *
 * This is NOT `SignalStatus` (in `domain.ts`), and conflating the two is a
 * mistake worth naming:
 *
 *   SignalLifecycle — *how far through the machine it got.* A candidate that the
 *   Risk Engine rejected never became a signal at all. It has no entry price to
 *   be "active" at.
 *
 *   SignalStatus — *what happened to a signal that was published.* Active,
 *   triggered, stopped, completed, expired. It only exists for things that made
 *   it all the way out.
 *
 * The distinction matters because the rejections are the most honest thing the
 * platform produces. A pipeline that only models what survived cannot tell you
 * why a quiet day was quiet — and that answer is what makes silence credible
 * rather than suspicious (AGENTS.md §1).
 */
export const signalLifecycleSchema = z.enum([
  /** A strategy's entry conditions were met. It has proved nothing yet. */
  "CANDIDATE",
  /** It survived the Risk Engine. Every gate passed. */
  "VALIDATED",
  /** Validated, and awarded one of the day's few Prime slots (ADR-021). */
  "PRIME",
  /** The Risk Engine said no. It never became a signal. */
  "REJECTED",
  /** Published, and its outcome is recorded in the ledger. */
  "SETTLED",
]);
export type SignalLifecycle = z.infer<typeof signalLifecycleSchema>;

/**
 * Every gate a candidate can die at, and the stage it dies in.
 *
 * The Scanner renders these. A rejection without a *measured* reason is not
 * evidence — "rejected" tells a trader nothing, while "spread 0.081% > 0.05%
 * limit" tells them the machine looked and the machine was right.
 */
export const rejectionGateSchema = z.enum([
  /** The strategy's own conditions were not met. The common, boring case. */
  "ENTRY_CONDITIONS",
  /** 24h volume below the floor. Thin books mean slippage and manipulation. */
  "LIQUIDITY",
  /** Spread above the limit. The edge would be eaten before it arrived. */
  "SPREAD",
  /** Below the confidence floor. May be logged; never alerted. */
  "CONFIDENCE_FLOOR",
  /** The market condition suppresses this strategy — a breakout in a range. */
  "MARKET_CONDITION",
  /** The asset is flagged: hacked, depegged, exploited. Absolute. */
  "RISK_FLAG",
  /** Too many open positions already correlated to this one. */
  "CORRELATION",
  /** Total open risk is at the cap. New signals queue rather than stack. */
  "PORTFOLIO_HEAT",
  /** A tier-1 macro print is imminent. A stop into CPI is not a stop. */
  "MACRO_WINDOW",
  /** The same setup already fired. */
  "DUPLICATE",
  /** The strategy is switched off, or has never earned a record. */
  "STRATEGY_INELIGIBLE",
]);
export type RejectionGate = z.infer<typeof rejectionGateSchema>;

export const REJECTION_GATE_LABEL: Record<RejectionGate, string> = {
  ENTRY_CONDITIONS: "Entry conditions",
  LIQUIDITY: "Liquidity",
  SPREAD: "Spread",
  CONFIDENCE_FLOOR: "Confidence floor",
  MARKET_CONDITION: "Market condition",
  RISK_FLAG: "Risk flag",
  CORRELATION: "Correlation cap",
  PORTFOLIO_HEAT: "Portfolio heat",
  MACRO_WINDOW: "Macro window",
  DUPLICATE: "Duplicate",
  STRATEGY_INELIGIBLE: "Strategy ineligible",
};
