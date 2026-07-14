import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketNormalizer } from "./market.normalizer";

vi.mock("@nestjs/common", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    Logger: class {
      warn() {}
      debug() {}
      log() {}
      error() {}
    },
  };
});

/**
 * The boundary.
 *
 * A candle with a high below its low is not a rendering glitch. It is an ATR that
 * is wrong, a Bollinger band that is wrong, a stop distance that is wrong, and a
 * position size that is wrong — computed silently, with no error anywhere, and
 * handed to a trader as a number to bet on.
 *
 * These tests are the last thing standing between a bad exchange response and
 * that.
 */
describe("candle normalization", () => {
  let normalizer: MarketNormalizer;

  beforeEach(() => {
    normalizer = new MarketNormalizer();
  });

  // ccxt's OHLCV row: [time, open, high, low, close, volume]
  const good = [1_752_480_000_000, 145.0, 147.2, 144.1, 146.8, 12_400];

  it("normalizes a well-formed row", () => {
    const candle = normalizer.candle("BINANCE", good);
    expect(candle).toMatchObject({ open: 145.0, high: 147.2, close: 146.8 });
  });

  it("coerces the strings some exchanges send", () => {
    // Binance's REST API sends numbers as strings. Silently NaN-ing here would
    // poison every indicator downstream.
    const candle = normalizer.candle("BINANCE", [
      "1752480000000",
      "145.0",
      "147.2",
      "144.1",
      "146.8",
      "12400",
    ]);
    expect(candle?.close).toBe(146.8);
  });

  it("DROPS a candle whose high is below its low", () => {
    const candle = normalizer.candle("BINANCE", [
      1_752_480_000_000, 145.0, 140.0, 144.1, 146.8, 12_400,
    ]);
    expect(candle).toBeNull();
  });

  it("DROPS a zero price — that is a broken feed, not a cheap coin", () => {
    // A 0 entry makes (equity x risk%) / |entry - stop| hand back infinity.
    const candle = normalizer.candle("BINANCE", [
      1_752_480_000_000, 0, 147.2, 0, 146.8, 12_400,
    ]);
    expect(candle).toBeNull();
  });

  it("DROPS a malformed row rather than guessing at it", () => {
    expect(normalizer.candle("BINANCE", [1, 2, 3])).toBeNull();
    expect(normalizer.candle("BINANCE", null)).toBeNull();
    expect(normalizer.candle("BINANCE", "not a row")).toBeNull();
  });

  it("REPAIRS NOTHING — a repaired candle is a candle we invented", () => {
    const broken = [1_752_480_000_000, 145.0, 140.0, 144.1, 146.8, 12_400];
    expect(normalizer.candle("BINANCE", broken)).toBeNull();

    // And the rejection is COUNTED, so a degrading feed is visible in the admin
    // console rather than merely absent from the charts.
    expect(normalizer.rejectionCounts()["BINANCE:candle"]).toBe(1);
  });

  it("sorts a series — 'usually ordered' is not a guarantee", () => {
    // An out-of-order series makes every moving average nonsense, in a way that
    // is impossible to spot by eye.
    const candles = normalizer.candles("BINANCE", [
      [3_000, 1, 2, 0.5, 1.5, 10],
      [1_000, 1, 2, 0.5, 1.5, 10],
      [2_000, 1, 2, 0.5, 1.5, 10],
    ]);

    expect(candles.map((c) => c.time)).toEqual([1_000, 2_000, 3_000]);
  });

  it("keeps the good rows when one is bad", () => {
    const candles = normalizer.candles("BINANCE", [
      [1_000, 1, 2, 0.5, 1.5, 10],
      [2_000, 1, 0.1, 5, 1.5, 10], // high < low
      [3_000, 1, 2, 0.5, 1.5, 10],
    ]);

    expect(candles).toHaveLength(2);
  });
});

describe("funding rate normalization", () => {
  let normalizer: MarketNormalizer;

  beforeEach(() => {
    normalizer = new MarketNormalizer();
  });

  it("converts ccxt's decimal into the percent our contracts speak", () => {
    const funding = normalizer.fundingRate("BINANCE", "BTCUSDT", {
      fundingRate: 0.0001, // ccxt decimal
      timestamp: 1_752_480_000_000,
      fundingTimestamp: 1_752_508_800_000,
    });

    expect(funding?.rate).toBeCloseTo(0.01); // percent
  });

  it("returns NULL when there is no funding rate — never a fabricated zero", () => {
    // A funding rate of 0 is a CLAIM: "the market is perfectly balanced". Crowd
    // Squeeze would trade on it. Null says "we do not know", and the strategy
    // stands down.
    const funding = normalizer.fundingRate("BINANCE", "BTCUSDT", {
      timestamp: Date.now(),
    });

    expect(funding).toBeNull();
  });
});

describe("order book normalization", () => {
  let normalizer: MarketNormalizer;

  beforeEach(() => {
    normalizer = new MarketNormalizer();
  });

  it("computes the spread the Risk Engine gates on", () => {
    const book = normalizer.orderBook("BINANCE", "SOLUSDT", {
      bids: [[145.2, 100]],
      asks: [[145.25, 100]],
      timestamp: Date.now(),
    });

    expect(book?.spreadPercent).toBeCloseTo(0.0344, 3);
  });

  it("DROPS a crossed book — ask below bid is physically impossible", () => {
    const book = normalizer.orderBook("BINANCE", "SOLUSDT", {
      bids: [[145.5, 100]],
      asks: [[145.2, 100]],
      timestamp: Date.now(),
    });

    expect(book).toBeNull();
  });

  it("DROPS an empty book", () => {
    expect(
      normalizer.orderBook("BINANCE", "SOLUSDT", { bids: [], asks: [] }),
    ).toBeNull();
  });
});
