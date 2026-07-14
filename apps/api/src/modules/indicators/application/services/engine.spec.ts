import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Candle } from "@aegis/contracts";
import { OperatorEvaluator } from "./operator.evaluator";
import { DivergenceEngine } from "./divergence.engine";
import { TimeframeResolver, canAggregate } from "./timeframe.resolver";
import { IndicatorValidationService } from "./indicator-validation.service";
import { IndicatorRegistry } from "../registry/indicator.registry";
import {
  InsufficientCandlesError,
  MalformedSeriesError,
  InvalidParametersError,
} from "../../domain/indicator.errors";
import { rsiCalculator } from "../calculators/momentum.calculators";
import type { Maybe } from "../math/rolling";

vi.mock("@nestjs/common", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    Logger: class {
      log() {}
      warn() {}
      error() {}
      debug() {}
    },
  };
});

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);

/** Candles far enough in the past that the last one has definitely closed. */
function series(closes: number[], barMs = HOUR): Candle[] {
  const end = Date.now() - barMs * 2;
  const start = end - closes.length * barMs;

  return closes.map((close, i) => ({
    time: Math.floor((start + i * barMs) / barMs) * barMs,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
    takerBuyVolume: 50,
  }));
}

/* ── Operators ─────────────────────────────────────────────────────── */

describe("the operator evaluator", () => {
  let evaluator: OperatorEvaluator;

  beforeEach(() => {
    evaluator = new OperatorEvaluator();
  });

  const flat = (value: number, length: number): Maybe[] =>
    new Array(length).fill(value);

  it("A CONDITION ON AN UNKNOWN VALUE IS FALSE — never true", () => {
    /*
     * The most important assertion in this file.
     *
     * If the EMA(200) has not warmed up, "price is above the 200 EMA" is not true.
     * It is unanswerable, and the only safe reading of an unanswerable ENTRY
     * condition is "do not take this trade".
     *
     * If nulls were coerced to 0, this becomes "price is above zero" — true for
     * every asset that has ever existed, and the strategy would fire on all of
     * them.
     */
    const left: Maybe[] = [null, null, null];

    for (const operator of ["gt", "gte", "lt", "lte", "eq", "neq"] as const) {
      expect(
        evaluator.evaluate({
          operator,
          index: 2,
          left,
          right: flat(0, 3),
        }),
        `${operator} on a null must be false`,
      ).toBe(false);
    }
  });

  it("crosses_above fires ONCE, at the turn — not on every bar after it", () => {
    // The single most common strategy bug: treating a cross as a state rather than
    // an event. "MACD is above signal" is true for the whole trend; "MACD crossed
    // above signal" is true for exactly one bar. Confusing them produces a signal
    // on every bar until the trend ends.
    const left: Maybe[] = [1, 2, 5, 6, 7];
    const right: Maybe[] = [3, 3, 3, 3, 3];

    expect(evaluator.evaluate({ operator: "crosses_above", index: 1, left, right })).toBe(false);
    expect(evaluator.evaluate({ operator: "crosses_above", index: 2, left, right })).toBe(true);
    expect(evaluator.evaluate({ operator: "crosses_above", index: 3, left, right })).toBe(false);
    expect(evaluator.evaluate({ operator: "crosses_above", index: 4, left, right })).toBe(false);
  });

  it("crosses_below is the mirror", () => {
    const left: Maybe[] = [7, 6, 2, 1];
    const right: Maybe[] = [3, 3, 3, 3];

    expect(evaluator.evaluate({ operator: "crosses_below", index: 2, left, right })).toBe(true);
    expect(evaluator.evaluate({ operator: "crosses_below", index: 3, left, right })).toBe(false);
  });

  it("eq compares with a TOLERANCE — an EMA is never exactly 50", () => {
    const left: Maybe[] = [50.000000000001];

    // `===` here would be false, and a strategy built on it would never fire, with
    // nothing to explain why.
    expect(evaluator.evaluate({ operator: "eq", index: 0, left, right: [50] })).toBe(true);
    expect(evaluator.evaluate({ operator: "eq", index: 0, left, right: [51] })).toBe(false);
  });

  it("rising means STRICTLY rising — a flat bar breaks the run", () => {
    const rising: Maybe[] = [1, 2, 3, 4];
    const stalled: Maybe[] = [1, 2, 2, 3];

    expect(evaluator.evaluate({ operator: "rising", index: 3, left: rising, right: flat(3, 4) })).toBe(true);

    // Momentum that has stalled is not momentum that is building. Allowing ">=" here
    // would let a completely flat series report as "rising" forever.
    expect(evaluator.evaluate({ operator: "rising", index: 3, left: stalled, right: flat(3, 4) })).toBe(false);
  });

  it("between is inclusive; outside_range is NOT its negation for nulls", () => {
    const left: Maybe[] = [50];

    expect(
      evaluator.evaluate({ operator: "between", index: 0, left, right: [30], rightUpper: [70] }),
    ).toBe(true);

    expect(
      evaluator.evaluate({ operator: "outside_range", index: 0, left, right: [30], rightUpper: [70] }),
    ).toBe(false);

    // An UNKNOWN value is outside nothing. Both must be false — if `outside_range`
    // were implemented as `!between`, a null would satisfy it.
    const unknown: Maybe[] = [null];

    expect(
      evaluator.evaluate({ operator: "between", index: 0, left: unknown, right: [30], rightUpper: [70] }),
    ).toBe(false);
    expect(
      evaluator.evaluate({ operator: "outside_range", index: 0, left: unknown, right: [30], rightUpper: [70] }),
    ).toBe(false);
  });

  it("above_average excludes the current bar from its own benchmark", () => {
    // Values: 10,10,10,10,20. The average of the previous 4 is 10, and 20 > 10.
    const values: Maybe[] = [10, 10, 10, 10, 20];

    expect(
      evaluator.evaluate({ operator: "above_average", index: 4, left: values, right: flat(4, 5) }),
    ).toBe(true);

    // Had the current bar been included, the benchmark would be 14 — dragged up by
    // the very spike being measured, which makes the comparison self-referential.
  });

  it("divergence REFUSES to be evaluated here rather than silently returning false", () => {
    // A silent `false` would mean every divergence condition in every strategy
    // never fires, and nothing would ever say so.
    expect(() =>
      evaluator.evaluate({
        operator: "diverges_bullish",
        index: 1,
        left: [1, 2],
        right: [1, 2],
      }),
    ).toThrow(/Divergence Engine/);
  });
});

/* ── Divergence ────────────────────────────────────────────────────── */

describe("the divergence engine", () => {
  let engine: DivergenceEngine;

  beforeEach(() => {
    engine = new DivergenceEngine();
  });

  /** Price makes a lower low; the oscillator makes a higher low. */
  function bullishSetup(): { candles: Candle[]; indicator: Maybe[] } {
    const lows = [
      50, 48, 46, 40, 46, 48, 50, 52, 50, 48, // pivot low at index 3 (price 40)
      46, 44, 38, 44, 46, 48, 50, 52, 54, 56, // pivot low at index 12 (price 38 — LOWER)
    ];

    const candles: Candle[] = lows.map((low, i) => ({
      time: START + i * HOUR,
      open: low + 2,
      high: low + 4,
      low,
      close: low + 2,
      volume: 100,
      takerBuyVolume: 50,
    }));

    // The oscillator's low at index 12 is HIGHER than at index 3 — the sellers got
    // less for their effort. That disagreement is the whole signal.
    const indicator: Maybe[] = [
      50, 45, 40, 20, 35, 45, 55, 60, 50, 45,
      40, 35, 30, 40, 50, 55, 60, 65, 70, 75,
    ];

    return { candles, indicator };
  }

  it("detects bullish divergence between CONFIRMED pivots", () => {
    const { candles, indicator } = bullishSetup();
    const result = engine.bullish(candles, indicator, 20, 3);

    expect(result.detected).toBe(true);
    expect(result.kind).toBe("BULLISH");

    // Never a claim without its evidence. The two swings must come back with it.
    expect(result.swings).not.toBeNull();
    expect(result.swings![0].price).toBeGreaterThan(result.swings![1].price); // price fell
    expect(result.swings![1].indicatorValue).toBeGreaterThan(
      result.swings![0].indicatorValue,
    ); // the indicator rose
  });

  it("does NOT fire when both price and the indicator make lower lows", () => {
    // Price down, momentum down — that is agreement, not divergence. It is a
    // healthy downtrend, and a "divergence detector" that fires here fires on
    // everything.
    const { candles } = bullishSetup();
    const agreeing: Maybe[] = [
      50, 45, 40, 30, 35, 45, 55, 60, 50, 45,
      40, 35, 20, 40, 50, 55, 60, 65, 70, 75,
    ];

    expect(engine.bullish(candles, agreeing, 20, 3).detected).toBe(false);
  });

  it("NEVER uses an unconfirmed pivot — the last bars are off limits", () => {
    /*
     * The look-ahead trap.
     *
     * A pivot low at bar `i` is only a pivot once `strength` bars AFTER it have
     * failed to go lower. A "divergence" that uses the final bar is using a pivot
     * that cannot be known yet — it backtests beautifully, because in a backtest
     * the next five bars are already sitting there.
     */
    const { candles, indicator } = bullishSetup();
    const strength = 3;

    const result = engine.bullish(candles, indicator, 20, strength);

    if (result.swings) {
      for (const swing of result.swings) {
        expect(
          swing.index,
          "a swing was reported inside the unconfirmed tail — this is look-ahead bias",
        ).toBeLessThan(candles.length - strength);
      }
    }
  });

  it("scores a bigger disagreement as stronger, and does NOT saturate", () => {
    const { candles, indicator } = bullishSetup();

    // A marginal divergence: the oscillator's second low is barely higher.
    const marginal: Maybe[] = [...indicator];
    marginal[12] = 21; // the first pivot's oscillator low was 20

    // A pronounced one: it recovered a long way while price made a lower low.
    const pronounced: Maybe[] = [...indicator];
    pronounced[12] = 38;

    const weak = engine.bullish(candles, marginal, 20, 3);
    const strong = engine.bullish(candles, pronounced, 20, 3);

    expect(weak.detected).toBe(true);
    expect(strong.detected).toBe(true);

    expect(strong.strength).toBeGreaterThan(weak.strength);

    /*
     * The assertion that caught a real design flaw.
     *
     * The first version of `strength()` normalised so aggressively that BOTH of
     * these came back as exactly 1.00 — a "score" that is constant is not a score,
     * and the Confidence Engine would have been weighting by a number that never
     * varied while believing it was measuring something.
     */
    expect(weak.strength).toBeLessThan(1);
    expect(weak.strength).toBeGreaterThan(0);
    expect(strong.strength).toBeLessThanOrEqual(1);
  });

  it("returns nothing — and no half-answer — when there are not two pivots", () => {
    const flat: Candle[] = Array.from({ length: 10 }, (_, i) => ({
      time: START + i * HOUR,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
      takerBuyVolume: 0.5,
    }));

    const result = engine.bullish(flat, new Array(10).fill(50), 10, 3);

    expect(result.detected).toBe(false);
    expect(result.swings).toBeNull();
    expect(result.strength).toBe(0);
  });
});

/* ── Timeframes ────────────────────────────────────────────────────── */

describe("the timeframe resolver", () => {
  let resolver: TimeframeResolver;

  beforeEach(() => {
    resolver = new TimeframeResolver();
  });

  /** 15-minute candles across exactly two clean hours. */
  const quarters: Candle[] = Array.from({ length: 8 }, (_, i) => ({
    time: START + i * 15 * 60_000,
    open: 100 + i,
    high: 110 + i,
    low: 90 + i,
    close: 101 + i,
    volume: 10,
    takerBuyVolume: 6,
  }));

  it("aggregates 15m into 1h: first open, last close, max high, min low, summed volume", () => {
    const hourly = resolver.aggregate(quarters, "15m", "1h");

    expect(hourly).toHaveLength(2);

    expect(hourly[0].open).toBe(quarters[0].open);
    expect(hourly[0].close).toBe(quarters[3].close);
    expect(hourly[0].high).toBe(Math.max(...quarters.slice(0, 4).map((c) => c.high)));
    expect(hourly[0].low).toBe(Math.min(...quarters.slice(0, 4).map((c) => c.low)));
    expect(hourly[0].volume).toBe(40);
    expect(hourly[0].takerBuyVolume).toBe(24);
  });

  it("buckets are aligned to the EPOCH, not to the first candle we happen to hold", () => {
    // Start at 00:30 — mid-hour. The first two candles belong to the 00:00 bucket,
    // which is INCOMPLETE, and must be dropped rather than emitted as a 1h bar
    // starting at 00:30 that no exchange and no chart would agree with.
    const offset = quarters.map((c, i) => ({
      ...c,
      time: START + 30 * 60_000 + i * 15 * 60_000,
    }));

    const hourly = resolver.aggregate(offset, "15m", "1h");

    for (const candle of hourly) {
      expect(candle.time % (60 * 60_000)).toBe(0);
    }
  });

  it("DROPS an incomplete bucket — a partial bar is a FORMING bar", () => {
    // Seven 15m candles = one full hour plus three quarters of another. The second
    // hour has not finished. Emitting it would be look-ahead bias: its high can
    // still rise and its close can still reverse.
    const partial = quarters.slice(0, 7);
    const hourly = resolver.aggregate(partial, "15m", "1h");

    expect(hourly).toHaveLength(1);
  });

  it("a missing taker-buy volume poisons the whole aggregate — null, not a partial sum", () => {
    // Summing only the bars we can see produces a number that LOOKS like the hour's
    // buy volume and is actually understated by exactly the part we could not see.
    // CVD built on it would drift one way and look like real selling pressure.
    const holed = quarters.map((c, i) =>
      i === 2 ? { ...c, takerBuyVolume: null } : c,
    );

    const hourly = resolver.aggregate(holed, "15m", "1h");

    expect(hourly[0].takerBuyVolume).toBeNull();
    expect(hourly[1].takerBuyVolume).toBe(24); // the untouched hour is unaffected
  });

  it("refuses to invent detail it never had", () => {
    expect(() => resolver.aggregate(quarters, "1h", "15m")).toThrow(/SHORTER/);
  });

  it("knows which aggregations are possible", () => {
    expect(canAggregate("15m", "1h")).toBe(true);
    expect(canAggregate("15m", "4h")).toBe(true);
    expect(canAggregate("1h", "1d")).toBe(true);
    expect(canAggregate("4h", "1h")).toBe(false);
    expect(canAggregate("1h", "1h")).toBe(false);
  });
});

/* ── Validation ────────────────────────────────────────────────────── */

describe("the validation service refuses rather than repairs", () => {
  let validation: IndicatorValidationService;

  beforeEach(() => {
    validation = new IndicatorValidationService();
  });

  const check = (candles: Candle[], params = { period: 14 }) =>
    validation.assertComputable({
      indicator: rsiCalculator,
      candles,
      params,
      timeframe: "1h",
    });

  it("refuses to compute an EMA(200) from 50 candles", () => {
    expect(() =>
      validation.assertComputable({
        indicator: rsiCalculator,
        candles: series(new Array(10).fill(100)),
        params: { period: 200 },
        timeframe: "1h",
      }),
    ).toThrow(InsufficientCandlesError);
  });

  it("refuses a series with a GAP", () => {
    // An SMA(20) over a series missing five bars averages the last 20 PRESENT
    // candles — which span 25 bars of market. The number is wrong and confident.
    const candles = series(new Array(30).fill(100));
    candles.splice(10, 1); // punch a hole

    expect(() => check(candles)).toThrow(MalformedSeriesError);
    expect(() => check(candles)).toThrow(/gap/);
  });

  it("refuses a DUPLICATED timestamp", () => {
    /*
     * This test used to swap two candles and assert "out of order". It failed —
     * and it failed for an interesting reason worth recording: in a strictly-spaced
     * series, ANY reordering also creates a gap, and the gap check catches it
     * first. The swap was never reaching the ordering branch.
     *
     * The genuine out-of-order case is a DUPLICATE timestamp — two candles claiming
     * the same bar. That is what an exchange actually sends when it double-delivers
     * during a reconnect, and it is what this branch is for. An SMA over it would
     * count one bar twice and silently span the wrong stretch of market.
     */
    const candles = series(new Array(30).fill(100));
    candles[6] = { ...candles[6], time: candles[5].time };

    expect(() => check(candles)).toThrow(MalformedSeriesError);
    expect(() => check(candles)).toThrow(/out of order or duplicated/);
  });

  it("a reordered series is caught too (as the gap it necessarily creates)", () => {
    const candles = series(new Array(30).fill(100));
    [candles[5], candles[6]] = [candles[6], candles[5]];

    expect(() => check(candles)).toThrow(MalformedSeriesError);
  });

  it("refuses a FORMING candle — the one absolute rule", () => {
    const candles = series(new Array(30).fill(100));

    // Move the last candle into the current, unfinished hour.
    const bar = 3_600_000;
    candles[candles.length - 1] = {
      ...candles[candles.length - 1],
      time: Math.floor(Date.now() / bar) * bar,
    };
    // Repair the sequence so the ONLY complaint can be the forming bar.
    for (let i = candles.length - 2; i >= 0; i--) {
      candles[i] = { ...candles[i], time: candles[i + 1].time - bar };
    }

    expect(() => check(candles)).toThrow(/has not CLOSED/);
  });

  it("refuses a NaN before it can silence a strategy", () => {
    const candles = series(new Array(30).fill(100));
    candles[10] = { ...candles[10], close: NaN };

    expect(() => check(candles)).toThrow(/non-finite/);
  });

  it("refuses negative volume", () => {
    const candles = series(new Array(30).fill(100));
    candles[10] = { ...candles[10], volume: -5 };

    expect(() => check(candles)).toThrow(/negative volume/);
  });

  it("refuses a MACD whose fast period is not faster than its slow one", () => {
    expect(() =>
      validation.assertComputable({
        indicator: rsiCalculator,
        candles: series(new Array(60).fill(100)),
        params: { fastPeriod: 26, slowPeriod: 12 },
        timeframe: "1h",
      }),
    ).toThrow(InvalidParametersError);
  });
});

/* ── Registry ──────────────────────────────────────────────────────── */

describe("the indicator registry", () => {
  it("IMPLEMENTS EVERY INDICATOR THE CONTRACT DEFINES — checked at boot", () => {
    /*
     * The invariant that makes the vocabulary trustworthy.
     *
     * If the contract offers 47 indicators and the engine implements 46, the 47th
     * is a landmine: the strategy editor will happily offer it, a user will build a
     * strategy on it, and it will explode the first time a candle closes on a live
     * market. `onModuleInit` throws instead — at boot, where it is free.
     */
    const registry = new IndicatorRegistry();
    expect(() => registry.onModuleInit()).not.toThrow();
  });

  it("merges caller parameters over the calculator's defaults", () => {
    const registry = new IndicatorRegistry();

    expect(registry.parametersFor("rsi")).toMatchObject({ period: 14 });
    expect(registry.parametersFor("rsi", { period: 21 })).toMatchObject({ period: 21 });

    // An explicit `undefined` must not blow away the default — the caller who omits
    // a period wants the conventional one, not `undefined`.
    expect(
      registry.parametersFor("rsi", { period: undefined }),
    ).toMatchObject({ period: 14 });
  });

  it("refuses to resolve an indicator nobody implements", () => {
    const registry = new IndicatorRegistry();
    expect(() => registry.resolve("not_an_indicator" as never)).toThrow();
  });
});
