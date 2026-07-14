/**
 * Domain events.
 *
 * Modules communicate through these rather than by calling each other
 * (Philosophy 5). The Strategy Engine does not know the Signal Engine exists; it
 * announces that it evaluated something, and whoever cares, cares.
 *
 * That decoupling is what lets the Risk Engine sit immovably between them. If
 * strategy called signal directly, someone would eventually add a "fast path"
 * that skipped risk — and the one rule with no exceptions would have an
 * exception (AGENTS.md §5).
 */

export abstract class DomainEvent {
  /** When it happened. Not when it was handled. */
  readonly occurredAt: string = new Date().toISOString();

  /** Correlates an event back to the request or job that caused it. */
  readonly correlationId?: string;

  protected constructor(correlationId?: string) {
    this.correlationId = correlationId;
  }

  /** The event name, e.g. "market.updated". Used for subscription. */
  abstract readonly name: string;
}

/**
 * The events the pipeline will emit, named up front.
 *
 * The order is the pipeline, and the pipeline is immutable. Nothing may skip a
 * stage — most importantly, nothing may skip `signal.risk-validated`.
 */
export const EVENT = {
  MARKET_UPDATED: "market.updated",
  MARKET_CONDITION_CHANGED: "market.condition-changed",
  STRATEGY_EVALUATED: "strategy.evaluated",
  CANDIDATE_CREATED: "signal.candidate-created",
  RISK_VALIDATED: "signal.risk-validated",
  RISK_REJECTED: "signal.risk-rejected",
  SIGNAL_PUBLISHED: "signal.published",
  SIGNAL_SETTLED: "signal.settled",
  RISK_FLAG_RAISED: "insight.risk-flag-raised",
} as const;

export type EventName = (typeof EVENT)[keyof typeof EVENT];
