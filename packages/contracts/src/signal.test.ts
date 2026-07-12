import { describe, expect, it } from "vitest";
import { opportunitySchema } from "./scanner";

/**
 * These tests prove the contract is *enforced*, not merely declared.
 *
 * Each case is a signal that would compile fine as a TypeScript object and
 * still be wrong in a way that costs a trader money. The schema must reject
 * every one of them at the API boundary (Founding Principle 13 — Fail Safely).
 */

const validLong = {
  id: "opp_1",
  rank: 1,
  coin: "SOL",
  pair: "SOLUSDT",
  exchange: "Binance",
  direction: "LONG",
  strategies: ["Ignition"],
  timeframe: "1h",
  confidence: 87,
  riskLevel: "MODERATE",
  marketType: "PERPETUAL",
  suggestedLeverage: 3,
  isPrime: true,
  entryPrice: 145.3,
  stopLoss: 142.4,
  takeProfit: 154.0,
  rewardRisk: 3.0,
  regime: "TRENDING_BULL",
  status: "ACTIVE",
  generatedAt: "2026-07-12T09:30:00.000Z",
} as const;

describe("opportunity contract", () => {
  it("accepts a well-formed long", () => {
    expect(opportunitySchema.safeParse(validLong).success).toBe(true);
  });

  it("rejects a SHORT on SPOT — spot cannot be shorted (ADR-021 §3)", () => {
    const result = opportunitySchema.safeParse({
      ...validLong,
      direction: "SHORT",
      marketType: "SPOT",
      suggestedLeverage: null,
      stopLoss: 150.0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects leverage on a SPOT trade", () => {
    const result = opportunitySchema.safeParse({
      ...validLong,
      marketType: "SPOT",
      suggestedLeverage: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a PERPETUAL trade with no leverage", () => {
    const result = opportunitySchema.safeParse({
      ...validLong,
      suggestedLeverage: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a long whose stop sits above entry — that is not a stop", () => {
    const result = opportunitySchema.safeParse({
      ...validLong,
      stopLoss: 150.0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short whose stop sits below entry", () => {
    const result = opportunitySchema.safeParse({
      ...validLong,
      direction: "SHORT",
      stopLoss: 142.4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 100", () => {
    const result = opportunitySchema.safeParse({
      ...validLong,
      confidence: 105,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero entry price from a broken feed", () => {
    const result = opportunitySchema.safeParse({ ...validLong, entryPrice: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a signal credited to no strategy", () => {
    const result = opportunitySchema.safeParse({ ...validLong, strategies: [] });
    expect(result.success).toBe(false);
  });
});
