import { beforeEach, describe, expect, it } from "vitest";
import { SymbolRegistry } from "./symbol-registry";

/**
 * Every exchange spells the same market differently. If those strings travel
 * upward, the first `===` comparison between two of them fires a signal on the
 * wrong market — and nothing anywhere will complain.
 */
describe("canonicalising exchange symbols", () => {
  let registry: SymbolRegistry;

  beforeEach(() => {
    registry = new SymbolRegistry();
  });

  it.each([
    ["BTCUSDT", "BTC"], // Binance
    ["BTC/USDT", "BTC"], // ccxt unified
    ["BTC-USDT", "BTC"], // OKX, KuCoin
    ["BTC-USDT-SWAP", "BTC"], // OKX perpetual
    ["BTCUSDT.P", "BTC"], // TradingView perpetual
    ["BTC/USDT:USDT", "BTC"], // Bybit settlement suffix
    ["btcusdt", "BTC"], // lowercase
    ["  BTCUSDT  ", "BTC"], // whitespace
    ["SOLUSDC", "SOL"], // a different quote
    ["ETHUSD", "ETH"],
  ])("%s -> %s", (raw, expected) => {
    expect(registry.canonicalise(raw)).toBe(expected);
  });

  it("strips USDT before USD — order matters", () => {
    // Get this backwards and "BTCUSDT" becomes "BTCT", which is not a coin and
    // will never match anything. The bug would be silent: no signals, no errors.
    expect(registry.canonicalise("BTCUSDT")).toBe("BTC");
    expect(registry.canonicalise("BTCUSDT")).not.toBe("BTCT");
  });

  it("returns null rather than guessing at an unrecognised string", () => {
    // A WRONG canonical symbol is worse than none. It routes real market data
    // into the wrong coin's candle series, silently.
    expect(registry.canonicalise("NOTAPAIR")).toBeNull();
    expect(registry.canonicalise("")).toBeNull();
    expect(registry.canonicalise("USDT")).toBeNull();
  });

  it("takes a PAIR, not a bare base asset", () => {
    // This is not a quirk, it is the contract — and getting it wrong cost us a
    // real bug. `fetchSymbols` fed this ccxt's `market.base` ("BTC") instead of
    // its `market.symbol` ("BTC/USDT:USDT"). A bare base ends in no quote, so it
    // canonicalises to null, so it is skipped — and 4,495 of Binance's 4,498
    // markets were silently discarded. The three that survived were bases that
    // happened to end in USD-ish letters.
    //
    // Nothing threw. The platform simply had never heard of Bitcoin.
    expect(registry.canonicalise("BTC")).toBeNull();
    expect(registry.canonicalise("BTC/USDT:USDT")).toBe("BTC");
  });

  it("canonicalises the numeric-prefixed pairs the meme markets use", () => {
    expect(registry.canonicalise("1000PEPE/USDT:USDT")).toBe("1000PEPE");
  });
});

describe("spot and perpetual are different markets", () => {
  let registry: SymbolRegistry;

  beforeEach(() => {
    registry = new SymbolRegistry();

    // Binance uses the IDENTICAL string for both. A naive registry conflates
    // them — and they have different prices, different leverage, and different
    // liquidation behaviour.
    registry.register({
      exchange: "BINANCE",
      canonical: "BTC",
      marketType: "SPOT",
      nativeSymbol: "BTC/USDT",
    });
    registry.register({
      exchange: "BINANCE",
      canonical: "BTC",
      marketType: "PERPETUAL",
      nativeSymbol: "BTC/USDT:USDT",
    });
  });

  it("keeps them apart", () => {
    expect(
      registry.toNative("BINANCE", { symbol: "BTC", marketType: "SPOT" }),
    ).toBe("BTC/USDT");

    expect(
      registry.toNative("BINANCE", { symbol: "BTC", marketType: "PERPETUAL" }),
    ).toBe("BTC/USDT:USDT");
  });

  it("knows which markets an exchange actually lists", () => {
    expect(
      registry.lists("BINANCE", { symbol: "BTC", marketType: "PERPETUAL" }),
    ).toBe(true);

    // Never listed. The scanner must not produce a signal on a market that does
    // not exist — the frontend mock made exactly this mistake and rendered
    // charts for symbols nobody trades.
    expect(
      registry.lists("BINANCE", { symbol: "PEPE", marketType: "PERPETUAL" }),
    ).toBe(false);
  });

  it("returns null for a market the exchange does not list", () => {
    expect(
      registry.toNative("BYBIT", { symbol: "BTC", marketType: "PERPETUAL" }),
    ).toBeNull();
  });

  it("finds every exchange that lists a market", () => {
    registry.register({
      exchange: "OKX",
      canonical: "BTC",
      marketType: "PERPETUAL",
      nativeSymbol: "BTC-USDT-SWAP",
    });

    expect(
      registry.exchangesFor({ symbol: "BTC", marketType: "PERPETUAL" }).sort(),
    ).toEqual(["BINANCE", "OKX"]);
  });
});
