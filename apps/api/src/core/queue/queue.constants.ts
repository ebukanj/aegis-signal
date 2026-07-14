import type { JobsOptions } from "bullmq";

/**
 * The queues the platform will run. Named here, empty until their milestone.
 *
 * Declaring them up front is deliberate: the pipeline is immutable (AGENTS.md
 * §5), and its shape should be visible in the infrastructure before a single job
 * is written. If a future queue does not fit this list, that is a signal to stop
 * and think, not to add one quietly.
 */
export const QUEUE = {
  /** Market data collection from exchanges. */
  MARKET: "market",
  /** Strategy evaluation over candles. */
  STRATEGY: "strategy",
  /** Risk validation of candidates. */
  RISK: "risk",
  /** Signal publication, confluence, prime budget. */
  SIGNAL: "signal",
  /** Notification delivery (Prime only). */
  NOTIFICATION: "notification",
  /** Confidence calibration: historical replay + live ledger. */
  CALIBRATION: "calibration",
  /** Where jobs go to be looked at, not to be forgotten. */
  DEAD_LETTER: "dead-letter",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/**
 * Default job policy.
 *
 * `removeOnFail: false` is the important one. A failed job that deletes itself
 * is a failure nobody will ever investigate — and in this platform a failed job
 * might be the risk check that should have blocked a trade. Failures are kept.
 *
 * Successes are trimmed, because a queue that keeps every completed job
 * eventually eats Redis.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: false,
};
