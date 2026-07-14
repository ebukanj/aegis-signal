import { Injectable } from "@nestjs/common";
import type { Candle, Indicator, IndicatorParams, Timeframe } from "@aegis/contracts";
import type { IIndicator } from "../../domain/indicator.interface";
import {
  InsufficientCandlesError,
  InvalidParametersError,
  MalformedSeriesError,
} from "../../domain/indicator.errors";
import { timeframeMs } from "./timeframe.resolver";

/**
 * The gate.
 *
 * Everything below this line assumes its candles are clean, closed, ordered and
 * gapless — because checking those properties inside forty calculators would mean
 * checking them forty times, and forgetting them in at least one.
 *
 * **This service refuses. It never repairs.** No interpolating a missing bar, no
 * clamping a negative volume, no dropping a NaN and carrying on. A repaired candle
 * is a candle we invented, and an indicator computed from invented data is
 * indistinguishable from a real one by the time a trader is looking at the signal
 * it produced.
 */
@Injectable()
export class IndicatorValidationService {
  /**
   * @throws if the series or the parameters cannot produce an honest result.
   */
  assertComputable(input: {
    indicator: IIndicator;
    candles: readonly Candle[];
    params: IndicatorParams;
    timeframe: Timeframe;
  }): void {
    const { indicator, candles, params, timeframe } = input;

    this.assertParameters(indicator.name, params);
    this.assertSeries(indicator.name, candles, timeframe);

    const required = indicator.warmup(params);

    if (candles.length < required) {
      /*
       * The most important refusal in this file.
       *
       * Given 50 candles and asked for an EMA(200), most libraries return an
       * EMA of whatever they have and call it an EMA(200). The number looks
       * completely plausible. A strategy asking "is price above the 200 EMA" on a
       * coin listed a week ago gets a confident YES built on 50 bars, and the
       * 200 EMA it thinks it is reading does not exist yet.
       *
       * There is no answer to that question. Say so.
       */
      throw new InsufficientCandlesError(
        indicator.name,
        required,
        candles.length,
      );
    }
  }

  /* ── The series ──────────────────────────────────────────────────── */

  private assertSeries(
    name: Indicator,
    candles: readonly Candle[],
    timeframe: Timeframe,
  ): void {
    if (candles.length === 0) {
      throw new MalformedSeriesError(name, "it is empty");
    }

    const barMs = timeframeMs(timeframe);
    const now = Date.now();

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      /*
       * NaN and Infinity.
       *
       * The market normalizer already refuses these at the exchange boundary, so
       * reaching here means something inside our own walls produced one — an
       * aggregation bug, a bad cache entry. Checked anyway, because a NaN loose in
       * a strategy is the worst possible failure mode: `NaN > 30` is false and
       * `NaN < 30` is ALSO false, so every condition silently evaluates to "not
       * met" and the strategy simply never fires. No error. No signal. No clue.
       */
      for (const [field, value] of [
        ["open", candle.open],
        ["high", candle.high],
        ["low", candle.low],
        ["close", candle.close],
        ["volume", candle.volume],
      ] as const) {
        if (!Number.isFinite(value)) {
          throw new MalformedSeriesError(
            name,
            `candle ${i} has a non-finite ${field} (${value})`,
            { index: i, time: candle.time },
          );
        }
      }

      if (candle.volume < 0) {
        throw new MalformedSeriesError(
          name,
          `candle ${i} has negative volume`,
          { index: i, volume: candle.volume },
        );
      }

      if (candle.high < candle.low) {
        throw new MalformedSeriesError(
          name,
          `candle ${i} has a high below its low`,
          { index: i },
        );
      }

      if (i === 0) continue;

      const previous = candles[i - 1];

      /*
       * ORDER.
       *
       * An out-of-order series produces a moving average that is arithmetically
       * flawless and completely meaningless, and there is no way to spot it by
       * looking at the number. Every exchange returns candles in order — "usually".
       */
      if (candle.time <= previous.time) {
        throw new MalformedSeriesError(
          name,
          `candles ${i - 1} and ${i} are out of order or duplicated`,
          { previous: previous.time, current: candle.time },
        );
      }

      /*
       * GAPS.
       *
       * A missing bar is not a cosmetic problem. Every window-based indicator
       * would silently span a longer stretch of real time than it claims: an
       * SMA(20) over a series missing five bars is an average of the last 20
       * *present* candles, which covers 25 bars of market. The number is wrong and
       * confident.
       *
       * Crypto trades 24/7, so unlike equities there are no legitimate weekend
       * holes. A gap here is missing data, and missing data is a refusal.
       */
      const expected = previous.time + barMs;
      if (candle.time !== expected) {
        throw new MalformedSeriesError(
          name,
          `the series has a gap — candle ${i} is at ${new Date(candle.time).toISOString()} ` +
            `but the previous bar closed expecting ${new Date(expected).toISOString()}`,
          { index: i, expected, actual: candle.time, timeframe },
        );
      }
    }

    /*
     * THE FORMING BAR. The one absolute rule of this module.
     *
     * A candle whose close time has not passed is still moving. Its high can rise,
     * its close can reverse. A strategy that evaluates against it was decided on
     * information that did not exist at the time — and it will backtest
     * beautifully, because in a backtest that bar has already finished.
     *
     * The market module strips it. If one arrives anyway, something upstream is
     * broken and the honest response is to stop, not to compute a number that a
     * trader will bet on.
     */
    const last = candles[candles.length - 1];
    if (last.time + barMs > now) {
      throw new MalformedSeriesError(
        name,
        `the last candle (${new Date(last.time).toISOString()}) has not CLOSED yet — ` +
          `evaluating it is look-ahead bias`,
        { time: last.time, closesAt: last.time + barMs, now },
      );
    }
  }

  /* ── The parameters ──────────────────────────────────────────────── */

  private assertParameters(name: Indicator, params: IndicatorParams): void {
    /*
     * MACD with fast >= slow is arithmetically fine and produces a mirrored,
     * meaningless curve. Nothing downstream would ever notice.
     */
    if (
      params.fastPeriod !== undefined &&
      params.slowPeriod !== undefined &&
      params.fastPeriod >= params.slowPeriod
    ) {
      throw new InvalidParametersError(
        name,
        `the fast period (${params.fastPeriod}) must be shorter than the slow period ` +
          `(${params.slowPeriod}) — otherwise the indicator is its own mirror image`,
      );
    }

    if (
      params.step !== undefined &&
      params.maxStep !== undefined &&
      params.step > params.maxStep
    ) {
      throw new InvalidParametersError(
        name,
        `the acceleration step (${params.step}) cannot exceed its own cap (${params.maxStep})`,
      );
    }
  }
}
