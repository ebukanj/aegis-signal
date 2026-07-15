import { Injectable } from "@nestjs/common";

/**
 * When to try again, and when to give up.
 *
 * ── A pure function, so it is testable and identical everywhere ──
 *
 * The retry policy is arithmetic on the attempt count — no state, no clock. That is
 * deliberate: retry logic that is entangled with timers and queues is the kind that
 * silently retries forever or gives up too soon, and neither failure is visible
 * until a trader misses a notification. Here the schedule is a function you can
 * assert: attempt 1 waits ~1s, attempt 2 ~4s, attempt 3 ~9s, and attempt 4 is the
 * dead letter.
 *
 * Only RETRYABLE failures retry. A permanent failure (a bad address, a 400, an
 * unconfigured channel) is not retried — hammering a provider that has told you no
 * is how you earn a rate-limit and delay everything else in the queue.
 */
@Injectable()
export class RetryPolicy {
  static readonly MAX_ATTEMPTS = 3;

  /** Should a failure at this attempt be retried? */
  shouldRetry(attempt: number, retryable: boolean): boolean {
    return retryable && attempt < RetryPolicy.MAX_ATTEMPTS;
  }

  /**
   * Backoff before the next attempt, in ms. Quadratic with a small jitter-free base
   * so the schedule is deterministic and assertable — a provider blip clears in
   * seconds, a sustained outage reaches the dead letter quickly rather than
   * clogging the queue with a doomed job for minutes.
   */
  delayMs(attempt: number): number {
    return attempt * attempt * 1000;
  }
}
