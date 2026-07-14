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

  /**
   * The candidate itself is malformed. A stop on the wrong side, a target that
   * cannot be reached, a missing regime.
   *
   * This is not a market rejection — it is a BUG, upstream, and it is reported as
   * one. A trade rejected for a bad spread is the machine working; a trade rejected
   * because the candidate was nonsense is the machine catching something that should
   * never have reached it.
   */
  "INVALID_CANDIDATE",

  /** Volatility is outside what the policy allows. A stop sized for yesterday. */
  "VOLATILITY",

  /**
   * The reward does not pay for the risk.
   *
   * A 1:1 trade needs to win more than half the time just to break even before fees,
   * and no strategy in this platform has earned the right to claim that.
   */
  "RISK_REWARD",

  /**
   * The stop is in a place that cannot work.
   *
   * Too tight — inside the noise this instrument routinely produces, so it is taken
   * out by nothing at all. Or too wide — the trade is then risking far more than the
   * setup was ever worth.
   */
  "STOP_QUALITY",

  /**
   * Entry sits directly into structure: a LONG into resistance, a SHORT into support.
   *
   * The trade is being taken at the exact price where the market has repeatedly
   * turned around. It may still work; it is being asked to do so from the worst
   * possible starting point.
   */
  "STRUCTURE",

  /**
   * Leverage would put liquidation before the stop.
   *
   * The most expensive mistake in leveraged trading: the account is closed out before
   * the trade is even proven wrong, and the stop is decoration.
   */
  "LIQUIDATION_RISK",

  /**
   * The evidence is STALE. Old candles, a frozen feed, a delayed evaluation.
   *
   * Not "we cannot see" — "what we can see is out of date", which is worse, because a
   * stale price looks exactly like a live one.
   */
  "STALE_DATA",

  /** The exchange is down, degraded, or its market feed is unhealthy. */
  "EXCHANGE_HEALTH",
]);
export type RejectionGate = z.infer<typeof rejectionGateSchema>;

export const REJECTION_GATE_LABEL: Record<RejectionGate, string> = {
  INVALID_CANDIDATE: "Malformed candidate",
  VOLATILITY: "Volatility",
  RISK_REWARD: "Risk / reward",
  STOP_QUALITY: "Stop placement",
  STRUCTURE: "Market structure",
  LIQUIDATION_RISK: "Liquidation risk",
  STALE_DATA: "Stale data",
  EXCHANGE_HEALTH: "Exchange health",
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
