import type { Candle, IndicatorParams } from "@aegis/contracts";
import type { Maybe } from "./rolling";

/**
 * Which price an indicator reads.
 *
 * "RSI" is ambiguous until you say *of what*. RSI of close is the default
 * everywhere; RSI of hlc3 is a different number, and a strategy comparing one
 * against a threshold tuned for the other is a strategy tuned for nothing.
 * Making the source explicit and part of the cache key means the two can coexist
 * without silently overwriting each other.
 */
export type PriceSource = NonNullable<IndicatorParams["source"]>;

export function extractSource(
  candles: readonly Candle[],
  source: PriceSource = "close",
): number[] {
  switch (source) {
    case "open":
      return candles.map((c) => c.open);
    case "high":
      return candles.map((c) => c.high);
    case "low":
      return candles.map((c) => c.low);
    case "close":
      return candles.map((c) => c.close);

    /** The bar's midpoint. Keltner and Ichimoku are built on it. */
    case "hl2":
      return candles.map((c) => (c.high + c.low) / 2);

    /** The "typical price". CCI, MFI and VWAP are defined on it. */
    case "hlc3":
      return candles.map((c) => (c.high + c.low + c.close) / 3);

    /** The bar's average price. Smoothest of the four; rarely the right choice. */
    case "ohlc4":
      return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
  }
}

/**
 * True Range — the honest measure of a bar's movement.
 *
 * Not `high - low`. A bar that gaps up and then trades in a tight range moved
 * further than its own body suggests, and a stop placed on `high - low` would sit
 * inside noise the market has already demonstrated it can produce. True Range
 * takes the largest of:
 *
 *   · high − low                  (the bar's own range)
 *   · |high − previous close|     (the gap up, plus the bar)
 *   · |low  − previous close|     (the gap down, plus the bar)
 *
 * The first bar has no previous close, so it has no True Range. `null`, not
 * `high - low` — a fabricated first value propagates into ATR, which propagates
 * into every stop distance and every position size the Risk Engine computes.
 */
export function trueRange(candles: readonly Candle[]): Maybe[] {
  const out: Maybe[] = new Array(candles.length).fill(null);

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previousClose = candles[i - 1].close;

    out[i] = Math.max(
      current.high - current.low,
      Math.abs(current.high - previousClose),
      Math.abs(current.low - previousClose),
    );
  }

  return out;
}
