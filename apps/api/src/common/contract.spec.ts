import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { opportunitySchema } from "@aegis/contracts";
import { ContractViolationError, contract } from "./contract";

// The filter logs the violation; we do not need the noise in test output.
vi.mock("@nestjs/common", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    Logger: class {
      error() {}
      warn() {}
      log() {}
    },
  };
});

/**
 * `contract()` is what makes packages/contracts the API rather than a
 * description of it (ADR-022).
 *
 * TypeScript vanishes at runtime. A service that returns confidence as a string,
 * or omits a stop loss, compiles perfectly and then puts a broken trade in front
 * of a trader. These tests assert it dies here instead — in our logs, where it
 * costs us an alert rather than costing them money.
 */

const validSignal = {
  id: "opp_1",
  rank: 1,
  coin: "SOL",
  pair: "SOLUSDT",
  exchange: "Binance",
  direction: "LONG",
  strategies: ["Breakout"],
  timeframe: "1h",
  confidence: 87,
  riskLevel: "MODERATE",
  marketType: "PERPETUAL",
  suggestedLeverage: 3,
  isPrime: true,
  entryPrice: 145.3,
  stopLoss: 142.4,
  takeProfit: 154,
  rewardRisk: 3,
  regime: "TRENDING_BULL",
  status: "ACTIVE",
  generatedAt: "2026-07-14T09:30:00.000Z",
};

describe("contract()", () => {
  it("passes a payload that honours its contract", () => {
    expect(contract(opportunitySchema, validSignal)).toMatchObject({
      pair: "SOLUSDT",
    });
  });

  it("REFUSES TO SEND a SHORT signal marked SPOT", () => {
    // Compiles fine. Would be unexecutable. Must never reach a trader.
    expect(() =>
      contract(opportunitySchema, {
        ...validSignal,
        direction: "SHORT",
        marketType: "SPOT",
        suggestedLeverage: null,
        stopLoss: 150,
      }),
    ).toThrow(ContractViolationError);
  });

  it("REFUSES TO SEND a long whose stop sits above entry", () => {
    expect(() =>
      contract(opportunitySchema, { ...validSignal, stopLoss: 150 }),
    ).toThrow(ContractViolationError);
  });

  it("REFUSES TO SEND a confidence that arrived as a string", () => {
    // The classic serialisation bug TypeScript cannot see.
    expect(() =>
      contract(opportunitySchema, { ...validSignal, confidence: "87" }),
    ).toThrow(ContractViolationError);
  });

  it("REFUSES TO SEND a signal missing its stop loss", () => {
    const { stopLoss: _gone, ...noStop } = validSignal;
    expect(() => contract(opportunitySchema, noStop)).toThrow(
      ContractViolationError,
    );
  });

  it("names every violation, so the bug is findable without a repro", () => {
    try {
      contract(z.object({ a: z.number(), b: z.string() }), { a: "x", b: 1 });
      expect.unreachable("should have thrown");
    } catch (error) {
      const violations = (error as ContractViolationError).violations;
      expect(violations).toHaveLength(2);
      expect(violations.join(" ")).toContain("a");
      expect(violations.join(" ")).toContain("b");
    }
  });
});
