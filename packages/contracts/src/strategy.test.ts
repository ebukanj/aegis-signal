import { describe, expect, it } from "vitest";
import {
  isProven,
  needsDerivativesFeed,
  strategyDefinitionSchema,
} from "./strategy";
import { describeCondition, describeStrategy } from "./strategy-language";

/**
 * A strategy is a document (ADR-023), and users author these themselves. That
 * makes the schema the only thing standing between a mistyped rule and a real
 * trade. These tests are that guard.
 */

const breakout = {
  id: "breakout",
  name: "Breakout",
  summary: "Price escapes a quiet range on heavy volume.",
  origin: "BUILT_IN",
  enabled: true,
  direction: "BOTH",
  market: "PERPETUAL",
  timeframe: "1h",
  entry: [
    {
      kind: "rule",
      negate: false,
      condition: {
        kind: "comparison",
        left: { kind: "indicator", indicator: "close" },
        op: "gt",
        right: { kind: "indicator", indicator: "highest_high", period: 20 },
      },
    },
  ],
  filters: [],
  stop: { kind: "atr", period: 14, multiplier: 1.2 },
  targets: [
    { rMultiple: 1.5, closePercent: 50 },
    { rMultiple: 3.0, closePercent: 50 },
  ],
  riskPercent: 1.0,
  maxLeverage: 3,
  riskLevel: "MODERATE",
  record: null,
} as const;

describe("strategy document", () => {
  it("accepts a well-formed strategy", () => {
    expect(strategyDefinitionSchema.safeParse(breakout).success).toBe(true);
  });

  it("rejects targets that close more than 100% of the position", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      targets: [
        { rMultiple: 1.5, closePercent: 70 },
        { rMultiple: 3.0, closePercent: 70 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a SHORT strategy on SPOT — spot cannot be shorted", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      direction: "SHORT",
      market: "SPOT",
      maxLeverage: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects leverage on a SPOT strategy", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      direction: "LONG",
      market: "SPOT",
      maxLeverage: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a strategy with no entry conditions — that is not a rule", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      entry: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects `between` without an upper bound", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      entry: [
        {
          kind: "comparison",
          left: { kind: "indicator", indicator: "rsi", period: 14 },
          op: "between",
          right: { kind: "number", value: 55 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("the new vocabulary (ADR-024)", () => {
  it("accepts a pattern condition", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      entry: [
        {
          kind: "rule",
          negate: false,
          condition: { kind: "pattern", pattern: "BULL_FLAG", minQuality: 0.75 },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a pattern quality outside 0–1", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      entry: [
        {
          kind: "rule",
          negate: false,
          condition: { kind: "pattern", pattern: "BULL_FLAG", minQuality: 75 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects head & shoulders — it is not in the vocabulary, on purpose", () => {
    const result = strategyDefinitionSchema.safeParse({
      ...breakout,
      entry: [
        { kind: "pattern", pattern: "HEAD_AND_SHOULDERS", minQuality: 0.8 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("expresses divergence — impossible before ADR-024", () => {
    const divergence = {
      kind: "comparison" as const,
      left: { kind: "indicator" as const, indicator: "rsi" as const, period: 14 },
      op: "diverges_bullish" as const,
      right: { kind: "number" as const, value: 20 },
    };
    expect(
      strategyDefinitionSchema.safeParse({
        ...breakout,
        entry: [{ kind: "rule", negate: false, condition: divergence }],
      })
        .success,
    ).toBe(true);
    expect(describeCondition(divergence)).toBe(
      "RSI (14) shows bullish divergence over 20 bars",
    );
  });

  it("knows which strategies need the derivatives feed we do not have", () => {
    const withFunding = strategyDefinitionSchema.parse({
      ...breakout,
      entry: [
        {
          kind: "rule",
          negate: false,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "funding_rate" },
            op: "gte",
            right: { kind: "number", value: 0.08 },
          },
        },
      ],
    });
    expect(needsDerivativesFeed(withFunding)).toBe(true);
    expect(needsDerivativesFeed(strategyDefinitionSchema.parse(breakout))).toBe(
      false,
    );
  });
});

describe("a strategy explains itself", () => {
  it("renders its rules as plain English a trader can read", () => {
    const parsed = strategyDefinitionSchema.parse(breakout);
    const prose = describeStrategy(parsed);

    expect(prose.headline).toContain("LONG or SHORT");
    expect(prose.entry[0]).toBe("price is above the highest high (20)");
    expect(prose.stop).toBe("1.2× ATR (14) away from entry");
    expect(prose.targets[0]).toBe("+1.5R — close 50%");
    expect(prose.risk).toContain("Up to 3× leverage");
  });

  it("reads a pattern back in a trader's words", () => {
    expect(
      describeCondition({
        kind: "pattern",
        pattern: "CHANGE_OF_CHARACTER",
        minQuality: 0,
      }),
    ).toBe("a change of character has formed");

    expect(
      describeCondition({
        kind: "pattern",
        pattern: "FALLING_WEDGE",
        minQuality: 0.75,
        timeframe: "4h",
      }),
    ).toBe("a falling wedge has formed on the 4h (at least 75% clean)");
  });

  it("reads MACD momentum back correctly", () => {
    expect(
      describeCondition({
        kind: "comparison",
        left: { kind: "indicator", indicator: "macd_histogram" },
        op: "rising",
        right: { kind: "number", value: 2 },
      }),
    ).toBe("the MACD histogram has been rising for 2 bars");
  });

  it("never mentions leverage for a spot strategy", () => {
    const spot = strategyDefinitionSchema.parse({
      ...breakout,
      direction: "LONG",
      market: "SPOT",
      maxLeverage: null,
    });
    expect(describeStrategy(spot).risk).toContain("no leverage");
  });
});

describe("UNPROVEN strategies cannot take a Prime slot", () => {
  it("treats a strategy with no record as unproven", () => {
    expect(isProven(strategyDefinitionSchema.parse(breakout))).toBe(false);
  });

  it("treats a strategy with settled signals as proven", () => {
    const withRecord = strategyDefinitionSchema.parse({
      ...breakout,
      record: { signals: 23, wins: 12, expectancy: 0.31, avgR: 0.34 },
    });
    expect(isProven(withRecord)).toBe(true);
  });
});
