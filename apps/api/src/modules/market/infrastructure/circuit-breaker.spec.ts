import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { RateLimiter } from "./rate-limiter";

vi.mock("@nestjs/common", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    Logger: class {
      warn() {}
      log() {}
      error() {}
      debug() {}
    },
  };
});

/**
 * One exchange going down must never blind the platform.
 *
 * Without a breaker, every worker keeps hammering the dead exchange, every
 * request costs a full timeout, and the other four exchanges starve behind a wall
 * of pending requests to the one that is down.
 */
describe("circuit breaker", () => {
  const fail = () => Promise.reject(new Error("exchange down"));
  const succeed = () => Promise.resolve("ok");

  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker("TEST", {
      threshold: 3,
      cooldownMs: 100,
      probeSuccesses: 1,
    });
  });

  it("passes calls through while healthy", async () => {
    await expect(breaker.run(succeed)).resolves.toBe("ok");
    expect(breaker.isOpen).toBe(false);
  });

  it("opens after the threshold of consecutive failures", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(fail)).rejects.toThrow("exchange down");
    }
    expect(breaker.isOpen).toBe(true);
  });

  it("REJECTS INSTANTLY once open — the point is not to wait", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.run(fail).catch(() => {});
    }

    // A fast rejection frees the worker. A 15-second timeout holds it hostage,
    // and a hundred held workers is an outage of our own making layered on top
    // of theirs.
    const started = Date.now();
    await expect(breaker.run(succeed)).rejects.toThrow(CircuitOpenError);
    expect(Date.now() - started).toBeLessThan(20);
  });

  it("resets the failure count on any success", async () => {
    await breaker.run(fail).catch(() => {});
    await breaker.run(fail).catch(() => {});
    await breaker.run(succeed);
    await breaker.run(fail).catch(() => {});

    // 2 fails, a success, 1 fail — nowhere near 3 CONSECUTIVE.
    expect(breaker.isOpen).toBe(false);
  });

  it("probes once after the cooldown, and closes on success", async () => {
    for (let i = 0; i < 3; i++) await breaker.run(fail).catch(() => {});
    expect(breaker.isOpen).toBe(true);

    await new Promise((r) => setTimeout(r, 120));

    await expect(breaker.run(succeed)).resolves.toBe("ok");
    expect(breaker.isOpen).toBe(false);
  });

  it("RE-OPENS IMMEDIATELY on a failed probe", async () => {
    for (let i = 0; i < 3; i++) await breaker.run(fail).catch(() => {});
    await new Promise((r) => setTimeout(r, 120));

    // That was our one chance and it failed. Trying again straight away is how a
    // breaker becomes decoration.
    await expect(breaker.run(fail)).rejects.toThrow("exchange down");
    expect(breaker.isOpen).toBe(true);

    await expect(breaker.run(succeed)).rejects.toThrow(CircuitOpenError);
  });

  it("tracks an error rate for the admin console", async () => {
    await breaker.run(succeed);
    await breaker.run(fail).catch(() => {});

    expect(breaker.errorRate).toBeCloseTo(0.5);
  });
});

/**
 * Exchanges do not politely slow you down. They BAN the IP — and a ban blinds
 * every strategy on that venue at once, while the platform carries on producing
 * signals from candles that stopped updating.
 */
describe("rate limiter", () => {
  it("lets a burst through while there is budget", async () => {
    const limiter = new RateLimiter(600);

    const started = Date.now();
    for (let i = 0; i < 10; i++) await limiter.acquire();

    expect(Date.now() - started).toBeLessThan(50);
    expect(limiter.available).toBeLessThan(600);
  });

  it("WAITS rather than failing when the bucket is dry", async () => {
    // A request delayed by 200ms is an inconvenience. A request that triggers a
    // ban is an outage for everyone. And dropping it would leave a silent gap in
    // a candle series that nothing downstream would notice.
    const limiter = new RateLimiter(60); // one per second

    for (let i = 0; i < 60; i++) await limiter.acquire();
    expect(limiter.saturated).toBe(true);

    const started = Date.now();
    await limiter.acquire();

    expect(Date.now() - started).toBeGreaterThan(900);
  });

  it("refills continuously, not in fixed windows", async () => {
    // A fixed window lets you spend a whole minute's budget in its last second
    // and the next minute's in its first — a burst of 2x the limit that looks
    // compliant on paper and gets you banned in practice.
    const limiter = new RateLimiter(6_000); // 100/sec

    for (let i = 0; i < 6_000; i++) await limiter.acquire();
    expect(limiter.available).toBe(0);

    await new Promise((r) => setTimeout(r, 100));
    expect(limiter.available).toBeGreaterThan(5);
  });
});
