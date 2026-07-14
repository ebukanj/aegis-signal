import { Logger } from "@nestjs/common";
import { WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

/**
 * Every worker in the platform extends this.
 *
 * It exists for one reason: a job that fails silently is indistinguishable from
 * a job that succeeded, and this platform's jobs decide whether a trader sees a
 * trade. A market-data worker that dies quietly means the scanner is looking at
 * yesterday's candles and nobody knows.
 *
 * So: every job start, every success with its duration, every failure with its
 * attempt count, and — when retries are exhausted — an explicit, loud escalation
 * rather than a job silently rotting in `failed`.
 *
 * Subclasses implement `handle()` and think about the work, not the plumbing.
 */
export abstract class BaseWorker<T = unknown, R = unknown> extends WorkerHost {
  protected readonly logger: Logger;

  protected constructor(name: string) {
    super();
    this.logger = new Logger(name);
  }

  /** The actual work. Deterministic where it can be (Philosophy 14). */
  protected abstract handle(job: Job<T>): Promise<R>;

  async process(job: Job<T>): Promise<R> {
    const start = Date.now();

    this.logger.log(
      { jobId: job.id, name: job.name, attempt: job.attemptsMade + 1 },
      "Job started",
    );

    try {
      const result = await this.handle(job);

      this.logger.log(
        { jobId: job.id, name: job.name, durationMs: Date.now() - start },
        "Job completed",
      );

      return result;
    } catch (error) {
      const attemptsMade = job.attemptsMade + 1;
      const attemptsAllowed = job.opts.attempts ?? 1;
      const exhausted = attemptsMade >= attemptsAllowed;

      this.logger.error(
        {
          err: error,
          jobId: job.id,
          name: job.name,
          attempt: attemptsMade,
          of: attemptsAllowed,
          durationMs: Date.now() - start,
          // The payload, so the failure is reproducible without guesswork.
          data: job.data,
        },
        exhausted
          ? "Job failed permanently — retries exhausted"
          : "Job failed, will retry",
      );

      if (exhausted) {
        await this.onExhausted(job, error);
      }

      // Rethrow: BullMQ owns the retry decision, not us.
      throw error;
    }
  }

  /**
   * Retries are gone. Override to route the job somewhere a human will see it.
   *
   * The default is a fatal-level log — deliberately the loudest thing this
   * codebase can say — because the alternative is a job that failed three times
   * and then simply stopped existing.
   */
  protected async onExhausted(job: Job<T>, error: unknown): Promise<void> {
    this.logger.fatal(
      { jobId: job.id, name: job.name, err: error, data: job.data },
      "Job exhausted every retry and requires attention",
    );
  }
}
