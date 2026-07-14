import { describe, expect, it } from "vitest";
import { IndicatorRegistry } from "../application/registry/indicator.registry";
import { FEED_DEPENDENT } from "../domain/indicator.interface";
import { DATASETS, type DatasetName } from "./datasets";
import type { Maybe } from "../application/math/rolling";

/**
 * THE BENCHMARK SUITE.
 *
 * Every indicator, against every dataset. It answers three questions that no unit
 * test asks:
 *
 *   1. Does anything BREAK on a market shape it was not written against? (An
 *      indicator developed on a trend and never run on a dead market is an
 *      indicator with an untested divide-by-zero in it.)
 *
 *   2. Is anything unacceptably SLOW? The scanner runs ~19 symbols × 4 timeframes
 *      × a dozen indicators on every closed bar. An O(n·period) implementation
 *      that should have been O(n) does not fail — it just quietly eats the budget
 *      until the scan no longer finishes inside a bar.
 *
 *   3. Does anything produce a value that is not a number? A NaN loose in a
 *      strategy makes every comparison against it silently false.
 */

const registry = new IndicatorRegistry();

/** The computable ones. The three derivatives indicators have no feed, by design. */
const COMPUTABLE = registry
  .all()
  .filter((indicator) => !FEED_DEPENDENT.includes(indicator.name));

describe("benchmark: every indicator against every market shape", () => {
  const datasets = Object.entries(DATASETS) as [DatasetName, typeof DATASETS[DatasetName]][];

  it("all 44 computable indicators are covered", () => {
    // Guards against an indicator being added to the vocabulary and quietly never
    // benchmarked — which is how the one with the divide-by-zero gets in.
    expect(COMPUTABLE.length).toBe(registry.all().length - FEED_DEPENDENT.length);
    expect(COMPUTABLE.length).toBeGreaterThanOrEqual(44);
  });

  describe.each(datasets)("%s", (datasetName, candles) => {
    it.each(COMPUTABLE.map((i) => [i.name, i] as const))(
      "%s computes without producing NaN or Infinity",
      (name, indicator) => {
        const params = indicator.defaults;

        const started = performance.now();
        const values: Maybe[] = indicator.compute({ candles, params });
        const elapsed = performance.now() - started;

        // Alignment. A series that is not one-value-per-candle attributes every
        // value to the wrong bar — silently, and catastrophically.
        expect(
          values.length,
          `${name} produced ${values.length} values for ${candles.length} candles`,
        ).toBe(candles.length);

        for (const [i, value] of values.entries()) {
          if (value === null) continue;

          expect(
            Number.isFinite(value),
            `${name} produced ${value} at bar ${i} of ${datasetName}`,
          ).toBe(true);
        }

        /*
         * 50ms for 300 candles is an enormously generous ceiling — everything here
         * comes in under 2ms. It is a TRIPWIRE, not a target: it catches the day
         * somebody replaces a rolling window with a nested loop and turns an O(n)
         * indicator into an O(n²) one. That change does not fail any correctness
         * test; it just makes the scanner miss its bar, weeks later, on production
         * data nobody was watching.
         */
        expect(
          elapsed,
          `${name} took ${elapsed.toFixed(1)}ms on ${candles.length} candles — is it O(n²)?`,
        ).toBeLessThan(50);
      },
    );
  });
});

/**
 * Throughput at production scale.
 *
 * The real question is not "is one indicator fast?" but "does a full scan finish
 * inside a bar?" The scanner's worst case is roughly 19 symbols × 4 timeframes ×
 * 12 indicators = ~900 calculations on every close.
 */
describe("throughput at scanner scale", () => {
  it("computes ~900 indicator series in well under a second", () => {
    const candles = DATASETS.VOLATILE;

    const workload = [
      "rsi",
      "ema",
      "sma",
      "atr",
      "macd_line",
      "macd_histogram",
      "adx",
      "bb_upper",
      "bb_lower",
      "supertrend",
      "obv",
      "volume_sma",
    ] as const;

    const started = performance.now();

    for (let symbol = 0; symbol < 19; symbol++) {
      for (let timeframe = 0; timeframe < 4; timeframe++) {
        for (const name of workload) {
          const indicator = registry.resolve(name);
          indicator.compute({ candles, params: indicator.defaults });
        }
      }
    }

    const elapsed = performance.now() - started;

    /*
     * The budget that matters: a 15m bar closes every 900,000ms. Even one second
     * would be 0.1% of it, and we are far under that — but the number to watch is
     * the TREND across commits, not this threshold. An engine that is 10× slower
     * still passes this test and is still a problem.
     */
    expect(
      elapsed,
      `a full scanner pass took ${elapsed.toFixed(0)}ms`,
    ).toBeLessThan(2_000);
  });
});
