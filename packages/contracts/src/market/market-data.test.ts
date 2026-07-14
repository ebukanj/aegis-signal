import { describe, expect, it } from "vitest";
import { candleSchema, orderBookSummarySchema } from "./market-data";

/**
 * Market data is the only thing in this platform that is not an opinion.
 * Everything downstream is derived from it — every indicator, every pattern,
 * every strategy evaluation.
 *
 * A wrong candle is a wrong indicator is a wrong signal is a real loss. These
 * tests are the boundary.
 */

const candle = {
  time: 1_752_480_000_000,
  open: 145.0,
  high: 147.2,
  low: 144.1,
  close: 146.8,
  volume: 12_400,
};

describe("candle", () => {
  it("accepts a coherent candle", () => {
    expect(candleSchema.safeParse(candle).success).toBe(true);
  });

  it("accepts a dead bar with zero volume", () => {
    // Real, and common on illiquid pairs at 3am. Not an error.
    expect(candleSchema.safeParse({ ...candle, volume: 0 }).success).toBe(true);
  });

  it("REJECTS a candle whose high is below its low", () => {
    // It looks like a number. It destroys every indicator computed from it,
    // silently, with no error anywhere.
    const result = candleSchema.safeParse({ ...candle, high: 140, low: 144.1 });
    expect(result.success).toBe(false);
  });

  it("REJECTS a high that is not the highest price", () => {
    expect(
      candleSchema.safeParse({ ...candle, high: 146, close: 146.8 }).success,
    ).toBe(false);
  });

  it("REJECTS a low that is not the lowest price", () => {
    expect(
      candleSchema.safeParse({ ...candle, low: 145.5, open: 145.0 }).success,
    ).toBe(false);
  });

  it("REJECTS a zero price — that is a broken feed, not a cheap coin", () => {
    // A 0 entry makes (equity x risk%) / |entry - stop| hand back infinity.
    expect(candleSchema.safeParse({ ...candle, open: 0 }).success).toBe(false);
  });

  it("REJECTS negative volume", () => {
    expect(candleSchema.safeParse({ ...candle, volume: -1 }).success).toBe(
      false,
    );
  });

  it("REJECTS NaN", () => {
    expect(candleSchema.safeParse({ ...candle, close: NaN }).success).toBe(
      false,
    );
  });
});

describe("order book", () => {
  const book = {
    exchange: "BINANCE",
    pair: "SOLUSDT",
    bestBid: 145.2,
    bestAsk: 145.25,
    spreadPercent: 0.034,
    bidDepth1Percent: 420_000,
    askDepth1Percent: 380_000,
    at: "2026-07-14T09:30:00.000Z",
  };

  it("accepts a healthy book", () => {
    expect(orderBookSummarySchema.safeParse(book).success).toBe(true);
  });

  it("REJECTS a crossed book — ask below bid", () => {
    // Physically impossible. Means the feed is broken or the data is stale, and
    // either way the spread gate is about to read garbage.
    expect(
      orderBookSummarySchema.safeParse({
        ...book,
        bestBid: 145.5,
        bestAsk: 145.2,
      }).success,
    ).toBe(false);
  });
});
