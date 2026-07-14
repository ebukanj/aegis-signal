import type { Candle, Indicator, IndicatorParams } from "@aegis/contracts";

/**
 * What every indicator is, and what none of them may be.
 *
 * An indicator is a **pure function of closed candles**. Same candles in, same
 * numbers out, forever — on any machine, in any order, a year from now. That is
 * not a style preference, it is the property the entire platform rests on:
 * confidence is *calibrated* by replaying history (ADR-024), and you cannot
 * calibrate against a function that does not reproduce.
 *
 * So an indicator may not:
 *
 *   · read the clock          — a value that depends on *when* you asked is not
 *                               reproducible, and calibration would be measuring
 *                               the replay, not the strategy
 *   · read configuration      — then the number depends on a deploy
 *   · touch Redis or Postgres — caching happens ABOVE this layer, deliberately,
 *                               so the calculator stays testable with an array
 *   · call an exchange        — the data arrives; it is never fetched from here
 *   · know a strategy exists  — indicators provide evidence, they never decide
 *
 * Everything in this module is built so those are hard to violate by accident:
 * `compute` receives an array and returns an array, and there is nowhere in that
 * signature to smuggle a side effect.
 */

/** Everything a calculation is allowed to see. Note what is absent: everything else. */
export interface IndicatorContext {
  /**
   * CLOSED candles only, oldest → newest, no gaps.
   *
   * The caller guarantees this (`IndicatorValidationService` enforces it). A
   * forming bar in here is look-ahead bias: the bar can still reverse, so a rule
   * that reads it was decided on information that did not exist yet. It will
   * backtest beautifully and lose money live.
   */
  readonly candles: readonly Candle[];

  /** Merged over the calculator's own defaults. Never empty by the time it lands here. */
  readonly params: IndicatorParams;
}

/**
 * One indicator.
 *
 * `compute` returns **exactly one value per candle**, aligned by index. Leading
 * bars that cannot be computed are `null` — never `0`, never omitted.
 *
 * The nulls are the point. An EMA(200) has no value at bar 3, and the honest
 * answer is "I do not know". A `0` there would be read by a strategy as *"price
 * is above the 200 EMA"*, which on a fresh listing is how a rule that believes it
 * is being careful buys the top of a pump. Dropping the bars instead would be
 * worse still: the array would silently misalign with the candles, and every
 * value would be attributed to the wrong bar.
 */
export interface IIndicator {
  /** The name in the contract's vocabulary. The registry keys on this. */
  readonly name: Indicator;

  /** Human-readable, for the strategy editor and for error messages. */
  readonly label: string;

  /**
   * The conventional parameters.
   *
   * RSI 14, MACD 12/26/9, Bollinger 20/2. Not because convention is *correct* —
   * it is arbitrary — but because a trader comparing our RSI against TradingView
   * must be comparing the same thing before any disagreement means anything.
   */
  readonly defaults: IndicatorParams;

  /**
   * How many candles before the FIRST non-null value.
   *
   * Used two ways, and both matter: the validator refuses to compute when it has
   * fewer bars than this (rather than returning a series of nulls that a careless
   * caller reads as "condition not met"), and the caller uses it to know how much
   * history to fetch.
   *
   * For recursive indicators (EMA, RSI, ADX) this is the point at which the value
   * becomes *defined*, not the point at which it becomes *accurate* — an EMA
   * seeded 200 bars ago still carries a trace of its seed. `stabilityBars` is the
   * honest answer to that second question.
   */
  warmup(params: IndicatorParams): number;

  /**
   * How many bars until the value is not merely defined but TRUSTWORTHY.
   *
   * Recursive indicators never fully forget their seed; they only decay it. An
   * EMA(200) computed from exactly 200 bars is a different number from one
   * computed from 1000, and the difference is the seed still showing through.
   * Defaults to `warmup` for the indicators where the two are the same (SMA, ATR
   * of the non-Wilder kind, anything with a closed-form window).
   */
  stability?(params: IndicatorParams): number;

  /** The calculation. Pure. One value per candle, `null` where undefined. */
  compute(context: IndicatorContext): (number | null)[];
}

/**
 * Indicators that cannot be computed from candles at all.
 *
 * Funding rate, open interest and long/short ratio are not derived from OHLCV —
 * they are separate feeds. They live in the vocabulary because strategies refer
 * to them, and they are declared here so the registry can answer "unavailable"
 * deliberately rather than by absence.
 *
 * The distinction matters: an indicator *missing* from the registry is a bug, and
 * an indicator *declared unavailable* is a fact about the world. A strategy that
 * needs one stands down (Crowd Squeeze already ships DISABLED for exactly this).
 */
export const FEED_DEPENDENT: Indicator[] = [
  "funding_rate",
  "open_interest",
  "long_short_ratio",
];
