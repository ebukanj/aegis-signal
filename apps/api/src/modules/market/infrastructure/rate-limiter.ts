/**
 * A token-bucket rate limiter, per exchange.
 *
 * Exchanges do not politely slow you down when you exceed their limit. They
 * **ban the IP**, for minutes, sometimes longer. And a ban does not degrade one
 * strategy — it blinds every strategy on that venue at once, while the platform
 * carries on producing signals from candles that stopped updating.
 *
 * That is the worst possible failure: not an outage, but *stale data presented as
 * live*. So this limiter waits rather than fails. A request delayed by 200ms is
 * an inconvenience; a request that triggers a ban is an outage for everyone.
 *
 * The bucket refills continuously rather than in fixed windows, because a fixed
 * window lets you spend an entire minute's budget in its final second and then
 * the next minute's in its first — a burst of 2× the limit that looks compliant
 * on paper and gets you banned in practice.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(requestsPerMinute: number) {
    this.capacity = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.refillPerMs = requestsPerMinute / 60_000;
    this.lastRefillAt = Date.now();
  }

  /**
   * Take a token, waiting if the bucket is dry.
   *
   * Never rejects. The caller wanted the data, and dropping the request would
   * leave a gap in a candle series that nothing downstream would notice — a
   * silently missing bar is a silently wrong indicator.
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait exactly long enough for one token, plus a hair for clock jitter.
    const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs) + 5;
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;

    if (elapsed <= 0) return;

    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillPerMs,
    );
    this.lastRefillAt = now;
  }

  /** For the Admin console: how much budget is left. */
  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  get saturated(): boolean {
    return this.available < 1;
  }
}
