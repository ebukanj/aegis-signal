import { Logger } from "@nestjs/common";

/**
 * A circuit breaker, per exchange.
 *
 * The failure it prevents is specific and expensive. An exchange starts refusing
 * requests — rate limit, maintenance, an outage. Without a breaker, every worker
 * keeps hammering it, every request costs a timeout, the queue backs up, and the
 * *other four exchanges* starve behind a wall of pending requests to the one that
 * is down.
 *
 * One exchange going down must never blind the platform. That is what "graceful
 * degradation" actually means here: BTC keeps updating from Bybit while Binance
 * is out, and the strategies that depend on Binance stand down *explicitly*
 * rather than reading stale data and pretending.
 *
 *     CLOSED     normal. Failures counted.
 *     OPEN       tripped. Requests rejected instantly — no timeout, no queue.
 *     HALF_OPEN  one probe allowed. Success closes it; failure re-opens it.
 *
 * The half-open state is what stops the breaker from flapping: a single probe,
 * not a stampede of retries the moment the cooldown expires.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitOpenError extends Error {
  constructor(name: string, reopensInMs: number) {
    super(
      `${name} circuit is open — refusing to call it for another ${Math.ceil(reopensInMs / 1000)}s`,
    );
    this.name = "CircuitOpenError";
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  threshold: number;
  /** How long to stay open before allowing one probe. */
  cooldownMs: number;
  /** Successes required in HALF_OPEN before closing. */
  probeSuccesses: number;
}

export class CircuitBreaker {
  private readonly logger: Logger;

  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private probeSuccesses = 0;
  private openedAt = 0;

  /** Rolling window for the error rate the Admin console reads. */
  private readonly recent: boolean[] = [];
  private static readonly WINDOW = 100;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions,
  ) {
    this.logger = new Logger(`CircuitBreaker:${name}`);
  }

  /**
   * Run `operation` through the breaker.
   *
   * When OPEN this throws **immediately** rather than attempting the call. That
   * immediacy is the entire value: a fast rejection frees the worker, while a
   * 15-second timeout holds it hostage — and a hundred held workers is an outage
   * of our own making, layered on top of theirs.
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.openedAt;

      if (elapsed < this.options.cooldownMs) {
        throw new CircuitOpenError(
          this.name,
          this.options.cooldownMs - elapsed,
        );
      }

      // Cooldown served. Allow exactly one probe through.
      this.state = "HALF_OPEN";
      this.probeSuccesses = 0;
      this.logger.log("Cooldown elapsed — probing");
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.record(true);

    if (this.state === "HALF_OPEN") {
      this.probeSuccesses++;
      if (this.probeSuccesses >= this.options.probeSuccesses) {
        this.state = "CLOSED";
        this.consecutiveFailures = 0;
        this.logger.log("Recovered — circuit closed");
      }
      return;
    }

    this.consecutiveFailures = 0;
  }

  private onFailure(error: unknown): void {
    this.record(false);
    this.consecutiveFailures++;

    // A failed probe re-opens immediately. It was our one chance and it failed;
    // trying again straight away is how a breaker becomes decoration.
    if (this.state === "HALF_OPEN") {
      this.trip("probe failed");
      return;
    }

    if (this.consecutiveFailures >= this.options.threshold) {
      this.trip(
        error instanceof Error ? error.message : "consecutive failures",
      );
    }
  }

  private trip(reason: string): void {
    this.state = "OPEN";
    this.openedAt = Date.now();

    this.logger.error(
      {
        reason,
        consecutiveFailures: this.consecutiveFailures,
        cooldownMs: this.options.cooldownMs,
      },
      "Circuit OPEN — this exchange is cut off until it recovers",
    );
  }

  private record(ok: boolean): void {
    this.recent.push(ok);
    if (this.recent.length > CircuitBreaker.WINDOW) this.recent.shift();
  }

  /* ── Observability ───────────────────────────────────────────────── */

  get isOpen(): boolean {
    return this.state === "OPEN";
  }

  get currentState(): CircuitState {
    return this.state;
  }

  /** Failures as a share of the last 100 calls. Feeds the Admin console. */
  get errorRate(): number {
    if (this.recent.length === 0) return 0;
    const failures = this.recent.filter((ok) => !ok).length;
    return failures / this.recent.length;
  }

  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.probeSuccesses = 0;
    this.recent.length = 0;
  }
}
