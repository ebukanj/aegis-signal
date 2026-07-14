import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  Candle,
  Indicator,
  IndicatorParams,
  IndicatorSeries,
  Timeframe,
} from "@aegis/contracts";
import { indicatorKey } from "@aegis/contracts";
import { IndicatorRegistry } from "../registry/indicator.registry";
import { IndicatorValidationService } from "./indicator-validation.service";
import { IndicatorCache } from "../cache/indicator.cache";
import { normalizeSeries } from "../math/precision";
import type { Maybe } from "../math/rolling";
import { IndicatorError } from "../../domain/indicator.errors";

/**
 * The Indicator Engine's front door.
 *
 * The pipeline, in the order the milestone specifies and for the reasons below:
 *
 *   candles → VALIDATE → cache lookup → CALCULATE → normalize → cache → publish
 *
 * **Validation comes before the cache lookup**, which looks wasteful and is not.
 * A cache hit on a series that was computed from a bad set of candles is a fast
 * wrong answer, and a fast wrong answer is the worst kind — nothing about it looks
 * suspicious. Validation is a linear scan; it is cheap, and it is the only thing
 * standing between a forming candle and a strategy.
 *
 * This service computes. **It does not decide anything.** It never says a market
 * is overbought, never says a trend is strong, never scores a setup. It returns
 * numbers, and the fact that they are numbers rather than opinions is what makes
 * the layers above it auditable.
 */
@Injectable()
export class IndicatorService {
  private readonly logger = new Logger(IndicatorService.name);

  /** Health. Cheap counters, no allocation, nothing that can fail. */
  private executions = 0;
  private failures = 0;
  private totalLatencyMs = 0;
  private slowest = 0;

  constructor(
    private readonly registry: IndicatorRegistry,
    private readonly validation: IndicatorValidationService,
    private readonly cache: IndicatorCache,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * One indicator, one timeframe, one symbol.
   *
   * Returns a full series — one value per candle, `null` where undefined — rather
   * than only the latest value. Two reasons, and both are load-bearing:
   *
   *   · `crosses_above` needs the PREVIOUS bar to know a cross happened at all,
   *     and `rising` needs N of them. An engine that returned only "the current
   *     RSI" could not answer the questions strategies actually ask.
   *   · The Pattern Engine (M05) and the Divergence Engine both need the shape of
   *     the series, not a point on it.
   */
  async calculate(input: {
    symbol: string;
    candles: readonly Candle[];
    indicator: Indicator;
    timeframe: Timeframe;
    params?: IndicatorParams;
  }): Promise<IndicatorSeries> {
    const started = Date.now();

    const calculator = this.registry.resolve(input.indicator);
    const params = this.registry.parametersFor(input.indicator, input.params);

    try {
      // Before the cache, deliberately. See the class comment.
      this.validation.assertComputable({
        indicator: calculator,
        candles: input.candles,
        params,
        timeframe: input.timeframe,
      });

      const lastClosedBar = input.candles[input.candles.length - 1].time;

      const ref = {
        symbol: input.symbol,
        indicator: input.indicator,
        params,
        timeframe: input.timeframe,
        lastClosedBar,
      };

      const cached = await this.cache.get(ref);

      if (cached && cached.length === input.candles.length) {
        this.events.emit("indicator.cache.hit", {
          symbol: input.symbol,
          indicator: input.indicator,
          timeframe: input.timeframe,
        });

        return this.series(input, params, cached, calculator.warmup(params));
      }

      this.events.emit("indicator.cache.miss", {
        symbol: input.symbol,
        indicator: input.indicator,
        timeframe: input.timeframe,
      });

      /*
       * The calculation. Pure — it gets an array and returns an array, and there is
       * nowhere in that signature to hide a side effect.
       */
      const raw = calculator.compute({ candles: input.candles, params });

      /*
       * The boundary. Rounds once (never in the middle of a recursive calculation),
       * and turns any NaN or Infinity into null.
       *
       * The NaN catch matters more than it looks: a NaN loose in a strategy makes
       * EVERY comparison against it false — `NaN > 30` and `NaN < 30` are both
       * false — so the condition silently never fires and the strategy simply never
       * produces a signal, with nothing anywhere to say why.
       */
      const values = normalizeSeries(raw);

      if (values.length !== input.candles.length) {
        // A misaligned series attributes every value to the wrong bar. Catastrophic,
        // silent, and easy to introduce.
        throw new IndicatorError(
          input.indicator,
          `produced ${values.length} values for ${input.candles.length} candles — ` +
            `the series would be misaligned and every value attributed to the wrong bar`,
        );
      }

      await this.cache.set(ref, values);

      this.events.emit("indicator.calculated", {
        symbol: input.symbol,
        indicator: input.indicator,
        timeframe: input.timeframe,
        bars: values.length,
        durationMs: Date.now() - started,
      });

      this.record(started);

      return this.series(input, params, values, calculator.warmup(params));
    } catch (error) {
      this.failures++;

      this.events.emit("indicator.failed", {
        symbol: input.symbol,
        indicator: input.indicator,
        timeframe: input.timeframe,
        reason: error instanceof Error ? error.message : "unknown",
      });

      /*
       * Rethrown, never swallowed.
       *
       * The tempting alternative is to return a series of nulls "so the caller can
       * carry on". The caller would carry on — straight into a strategy that reads
       * the nulls as "condition not met", produces no signal, and reports no
       * problem. A strategy that silently stops working is worse than one that
       * loudly fails, because nobody goes looking for it.
       */
      throw error;
    }
  }

  /**
   * Several indicators at once.
   *
   * `allSettled`, not `all`: one indicator failing (an EMA(200) on a coin with 80
   * bars of history) must not take down the eleven that computed perfectly. The
   * caller gets what succeeded and is told, precisely, what did not — and a
   * strategy needing a failed one stands down while the rest of the platform keeps
   * working.
   */
  async calculateMany(input: {
    symbol: string;
    candles: readonly Candle[];
    timeframe: Timeframe;
    requests: { indicator: Indicator; params?: IndicatorParams }[];
  }): Promise<{
    series: Record<string, IndicatorSeries>;
    failed: Record<string, string>;
  }> {
    const results = await Promise.allSettled(
      input.requests.map((request) =>
        this.calculate({
          symbol: input.symbol,
          candles: input.candles,
          timeframe: input.timeframe,
          indicator: request.indicator,
          params: request.params,
        }),
      ),
    );

    const series: Record<string, IndicatorSeries> = {};
    const failed: Record<string, string> = {};

    results.forEach((result, i) => {
      const request = input.requests[i];
      const key = indicatorKey({
        indicator: request.indicator,
        timeframe: input.timeframe,
        params: this.registry.parametersFor(request.indicator, request.params),
      });

      if (result.status === "fulfilled") {
        series[key] = result.value;
      } else {
        failed[key] =
          result.reason instanceof Error ? result.reason.message : "unknown";
      }
    });

    if (Object.keys(failed).length > 0) {
      this.logger.warn(
        { symbol: input.symbol, failed },
        "Some indicators could not be computed — strategies depending on them will stand down",
      );
    }

    return { series, failed };
  }

  /** How much history to fetch so this indicator is stable, not merely defined. */
  requiredBars(indicator: Indicator, params?: IndicatorParams): number {
    const calculator = this.registry.resolve(indicator);
    const merged = this.registry.parametersFor(indicator, params);

    return calculator.stability?.(merged) ?? calculator.warmup(merged);
  }

  /* ── Health ──────────────────────────────────────────────────────── */

  metrics() {
    return {
      executions: this.executions,
      failures: this.failures,
      averageLatencyMs:
        this.executions === 0 ? 0 : this.totalLatencyMs / this.executions,
      slowestMs: this.slowest,
      cache: this.cache.stats(),
      registered: this.registry.all().length,
    };
  }

  private record(started: number): void {
    const elapsed = Date.now() - started;

    this.executions++;
    this.totalLatencyMs += elapsed;
    if (elapsed > this.slowest) this.slowest = elapsed;
  }

  private series(
    input: { candles: readonly Candle[]; indicator: Indicator; timeframe: Timeframe },
    params: IndicatorParams,
    values: readonly Maybe[],
    warmupBars: number,
  ): IndicatorSeries {
    return {
      indicator: input.indicator,
      period: params.period,
      params,
      timeframe: input.timeframe,
      values: input.candles.map((candle, i) => ({
        time: candle.time,
        value: values[i] ?? null,
      })),
      warmupBars,
    };
  }
}
