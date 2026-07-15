import { describe, expect, it } from "vitest";
import {
  leverageRecommendationSchema,
  positionSizingSchema,
  riskDecisionSchema,
} from "./risk";

/**
 * The Risk Engine's power to say NO is not an obstacle to the product. It IS the
 * product. These tests make the rules unrepresentable rather than merely
 * intended.
 */

describe("leverage recommendation", () => {
  const safe = {
    suggested: 5,
    maxAllowed: 10,
    liquidationPrice: 132.0,
    liquidationBeforeStop: false,
    liquidationBufferR: 2.1,
    reason: "Moderate risk, 2% stop distance",
  };

  it("accepts a leverage whose liquidation sits safely past the stop", () => {
    expect(leverageRecommendationSchema.safeParse(safe).success).toBe(true);
  });

  it("REFUSES a leverage at which the exchange liquidates before the stop", () => {
    // The most expensive mistake in leveraged trading. At this leverage the stop
    // is decoration: the account is gone before the trade is even proven wrong.
    // The Risk Engine must never be able to suggest it.
    const result = leverageRecommendationSchema.safeParse({
      ...safe,
      suggested: 25,
      liquidationBeforeStop: true,
      liquidationBufferR: -0.4,
    });
    expect(result.success).toBe(false);
  });

  it("REFUSES a suggestion above the cap for its risk level", () => {
    expect(
      leverageRecommendationSchema.safeParse({ ...safe, suggested: 20 }).success,
    ).toBe(false);
  });
});

describe("position sizing", () => {
  const perp = {
    equity: 10_000,
    riskPercent: 1,
    riskAmount: 100,
    entryPrice: 145.3,
    stopLoss: 142.4,
    stopDistancePercent: 2.0,
    quantity: 34.4828,
    notional: 5010.75,
    leverage: 3,
    marginRequired: 1670.25,
  };

  it("accepts a sized perpetual position", () => {
    expect(positionSizingSchema.safeParse(perp).success).toBe(true);
  });

  it("accepts spot — no leverage, no margin", () => {
    expect(
      positionSizingSchema.safeParse({
        ...perp,
        leverage: null,
        marginRequired: null,
      }).success,
    ).toBe(true);
  });

  it("REJECTS spot that somehow requires margin", () => {
    expect(
      positionSizingSchema.safeParse({ ...perp, leverage: null }).success,
    ).toBe(false);
  });
});

describe("risk decision", () => {
  const assessment = {
    level: "MODERATE" as const,
    score: 42,
    factors: [],
    limits: {
      portfolioHeatPercent: 1.8,
      portfolioHeatCap: 4,
      correlatedPositions: 1,
      correlatedPositionCap: 3,
      openPositions: 2,
    },
    warnings: [],
    /*
     * Required, and required for a reason: a risk assessment must always be able
     * to say what it could NOT check. An empty array is the claim "everything was
     * measured" — which is only true once every feed exists. Omitting the field
     * would let a report be silent about its own blind spots.
     */
    unassessed: [],
  };

  it("accepts an approval carrying its assessment", () => {
    const result = riskDecisionSchema.safeParse({
      approved: true,
      direction: "LONG",
      marketType: "PERPETUAL",
      assessment,
      decidedAt: "2026-07-14T09:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a rejection carrying the gate AND a measured reason", () => {
    const result = riskDecisionSchema.safeParse({
      approved: false,
      gate: "SPREAD",
      reason: "spread 0.081% — above the 0.05% limit",
      decidedAt: "2026-07-14T09:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS a rejection with no reason — that is not evidence", () => {
    // "Rejected" alone tells a trader nothing, and a quiet day becomes
    // indistinguishable from a broken feed.
    const result = riskDecisionSchema.safeParse({
      approved: false,
      gate: "SPREAD",
      reason: "",
      decidedAt: "2026-07-14T09:30:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS a rejection that does not name the gate it died at", () => {
    const result = riskDecisionSchema.safeParse({
      approved: false,
      reason: "something was wrong",
      decidedAt: "2026-07-14T09:30:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS an approval with no risk assessment behind it", () => {
    const result = riskDecisionSchema.safeParse({
      approved: true,
      direction: "LONG",
      marketType: "PERPETUAL",
      decidedAt: "2026-07-14T09:30:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS a SHORT approved on SPOT — spot cannot be shorted", () => {
    const result = riskDecisionSchema.safeParse({
      approved: true,
      direction: "SHORT",
      marketType: "SPOT",
      assessment,
      decidedAt: "2026-07-14T09:30:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
