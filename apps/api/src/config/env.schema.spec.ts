import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.schema";

/**
 * The environment is the first thing that can go wrong and the cheapest place to
 * catch it. These tests assert the app REFUSES to start on a bad one — because a
 * backend that boots with a broken config and fails later fails at the worst
 * possible moment, under load, in front of a user.
 */

const valid = {
  NODE_ENV: "development",
  PORT: "4000",
  APP_URL: "http://localhost:4000",
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://aegis:aegis@localhost:5432/aegis",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a-perfectly-adequate-development-secret-value",
};

describe("environment validation", () => {
  it("accepts a well-formed environment", () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4000);
    // Coerced, not left as a string. This is the whole point of validating.
    expect(typeof env.PORT).toBe("number");
    expect(env.TZ).toBe("UTC");
  });

  it("refuses to start without a database", () => {
    const { DATABASE_URL: _omitted, ...missing } = valid;
    expect(() => validateEnv(missing)).toThrow(/DATABASE_URL/);
  });

  it("refuses a database URL that is not postgres", () => {
    expect(() =>
      validateEnv({ ...valid, DATABASE_URL: "mysql://localhost/aegis" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("refuses a short secret — that is not a secret", () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: "hunter2" })).toThrow(
      /JWT_SECRET/,
    );
  });

  it("reports EVERY problem at once, not one per restart", () => {
    const broken = { ...valid, JWT_SECRET: "short", DATABASE_URL: "nope" };
    try {
      validateEnv(broken);
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("JWT_SECRET");
      expect(message).toContain("DATABASE_URL");
    }
  });

  it("REFUSES a placeholder secret in production", () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: "production",
        APP_URL: "https://api.aegis-signal.io",
        JWT_SECRET: "changeme-changeme-changeme-changeme-changeme",
      }),
    ).toThrow(/placeholder/i);
  });

  it("REFUSES localhost as the public URL in production", () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: "production",
        APP_URL: "http://localhost:4000",
      }),
    ).toThrow(/localhost/i);
  });

  it("allows a real production environment", () => {
    const env = validateEnv({
      ...valid,
      NODE_ENV: "production",
      APP_URL: "https://api.aegis-signal.io",
      JWT_SECRET: "Zq4vN8pR2tL6wX9cB3mK7hJ5dF1gS0yA4eU8iO2nP6rT",
    });
    expect(env.NODE_ENV).toBe("production");
  });
});
