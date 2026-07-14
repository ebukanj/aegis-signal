import { Logger } from "@nestjs/common";

/**
 * Retry with exponential backoff and jitter.
 *
 * Exchanges rate-limit, time out, and go down. That is normal and the platform
 * must survive it (PRD §14, Reliability).
 *
 * Two things this gets right that naive retries do not:
 *
 *   JITTER. Without it, every worker that failed in the same second retries in
 *   the same second, and the thundering herd finishes off an exchange that was
 *   merely wobbling.
 *
 *   NOT RETRYING WHAT CANNOT SUCCEED. A 400 will be a 400 forever. Retrying it
 *   three times just means being wrong three times, more slowly.
 */

const logger = new Logger("Retry");

export interface RetryOptions {
  attempts?: number;
  /** Delay before the first retry. Doubles each time. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false for errors that retrying cannot fix. */
  retryable?: (error: unknown) => boolean;
  /** For logs, so a retry storm is attributable. */
  label?: string;
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 8_000,
    retryable = () => true,
    label = "operation",
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!retryable(error) || attempt === attempts) break;

      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // Full jitter — spread the herd across the window rather than bunching it.
      const delay = Math.random() * backoff;

      logger.warn(
        { label, attempt, attempts, delayMs: Math.round(delay) },
        `${label} failed, retrying`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
