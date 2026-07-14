import type { Maybe } from "./rolling";

/**
 * THE ROUNDING STRATEGY.
 *
 * One rule, stated once, applied in exactly one place:
 *
 *   **Compute in full float64. Round once, at the boundary. Never in between.**
 *
 * ── Why not round as you go ──
 *
 * Rounding intermediates feels tidy and is how you get an RSI that disagrees with
 * TradingView in the third decimal for reasons nobody can reconstruct six months
 * later. Recursive indicators (EMA, RSI, ADX, ATR) feed each bar's output into
 * the next bar's input — so a rounding error at bar 40 is not a rounding error,
 * it is a permanent bias in every bar after it. The drift compounds and never
 * washes out.
 *
 * ── Why round at all ──
 *
 * Because float64 arithmetic is not associative, and two runs that *should* be
 * identical can differ in the last bit or two. That matters here more than in
 * most systems: confidence is calibrated by replaying history (ADR-024), and a
 * replay that does not reproduce is not a replay. Two runs over identical candles
 * must produce byte-identical output, and rounding to a fixed precision at the
 * boundary is what guarantees it.
 *
 * ── Why 10 significant digits ──
 *
 * Well inside float64's ~15-17 significant digits, so it discards only the noise
 * that arithmetic order introduced — never signal. And significant DIGITS rather
 * than decimal places, because this platform prices BTC at 62,000 and SHIB at
 * 0.0000082 in the same array: 8 decimal places would round SHIB's entire price
 * range into a handful of distinct values, and every indicator on it into a
 * staircase.
 */
const SIGNIFICANT_DIGITS = 10;

export function round(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;

  return Number(value.toPrecision(SIGNIFICANT_DIGITS));
}

/**
 * The boundary. Every series leaves the engine through here.
 *
 * Also the last line of defence against a NaN or an Infinity: both are `null`
 * here, deliberately. A NaN that escapes into a strategy makes every comparison
 * against it *false* — `NaN > 30` and `NaN < 30` are both false — so a condition
 * silently never fires and the strategy never produces a signal, with nothing
 * anywhere to say why. A null is caught; a NaN is not.
 */
export function normalizeSeries(values: readonly Maybe[]): Maybe[] {
  return values.map((value) => {
    if (value === null || !Number.isFinite(value)) return null;
    return round(value);
  });
}
