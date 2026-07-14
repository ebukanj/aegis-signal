import { describe, expect, it } from "vitest";
import {
  ADX,
  ATR,
  BollingerBands,
  CCI,
  EMA,
  MACD,
  MFI,
  RSI,
  SMA,
  Stochastic,
  WilliamsR,
} from "technicalindicators";

import type { Candle } from "@aegis/contracts";
import { TRENDING_UP, RANGING, VOLATILE } from "../../testing/datasets";
import {
  smaCalculator,
  emaCalculator,
} from "./price-volume.calculators";
import {
  cciCalculator,
  macdHistogramCalculator,
  macdLineCalculator,
  macdSignalCalculator,
  mfiCalculator,
  rsiCalculator,
  stochDCalculator,
  stochKCalculator,
  williamsRCalculator,
} from "./momentum.calculators";
import { adxCalculator } from "./trend.calculators";
import {
  atrCalculator,
  bbLowerCalculator,
  bbMiddleCalculator,
  bbUpperCalculator,
} from "./volatility.calculators";
import type { IIndicator } from "../../domain/indicator.interface";
import type { Maybe } from "../math/rolling";

/**
 * AN INDEPENDENT REFEREE.
 *
 * These tests do not check that our RSI matches a number we wrote down. They check
 * that it matches a **completely separate implementation, written by other people,
 * from the same published formula.**
 *
 * That distinction is the whole value of this file. A golden-master fixture proves
 * the code still does what it did the day it was written — bug faithfully included.
 * Two independent implementations agreeing to eight decimal places is strong
 * evidence that both read Wilder correctly, and that is a thing a fixture cannot
 * tell you.
 *
 * The failures this catches are exactly the ones that are otherwise invisible:
 * Wilder's α of 1/n against the EMA's 2/(n+1); population against sample standard
 * deviation; the mean-absolute deviation in CCI against the standard deviation;
 * seeding an EMA with the first value rather than an SMA. Every one produces a
 * plausible curve. Every one is wrong.
 *
 * ── TOLERANCES, and why they are what they are ──
 *
 * | Kind                                    | Tolerance | Why                                                              |
 * |-----------------------------------------|-----------|------------------------------------------------------------------|
 * | Closed-form (SMA, BB, Williams %R, CCI) | 1e-8      | Same arithmetic, different order. Only float64 noise may differ.  |
 * | Recursive (EMA, RSI, ATR, ADX, MACD)    | 1e-6      | Identical seeding, but the recursion accumulates float64 noise    |
 * |                                         |           | over hundreds of bars. 1e-6 on an RSI is the 8th significant      |
 * |                                         |           | digit — orders of magnitude below anything that could move a      |
 * |                                         |           | decision.                                                        |
 *
 * These are NOT "close enough" thresholds. They are float-noise thresholds. A
 * genuine formula disagreement — Wilder vs EMA, sample vs population — shows up in
 * the FIRST or SECOND significant digit and blows through both of these by a
 * factor of a million. There is no tolerance here inside which a real bug could
 * hide.
 */

const CLOSED_FORM = 1e-8;
const RECURSIVE = 1e-6;

/**
 * ── The reference's own rounding, and why it needs a different tolerance ──
 *
 * `technicalindicators` HARD-ROUNDS RSI and MFI to two decimals inside its own
 * implementation:
 *
 *     currentRSI = parseFloat((100 - (100 / (1 + RS))).toFixed(2));
 *
 * It is not configurable — passing `format: (v) => v` does not override it. So the
 * reference reports 93.86 where the true value is 93.86186765.
 *
 * **We do not round to match it, and we do not loosen the tolerance to hide it.**
 * Rounding our RSI to 2dp to make a test go green would be throwing away real
 * precision to flatter a comparison, and this engine's whole job is to be the
 * number that other things are checked against.
 *
 * Instead we assert agreement **within the reference's own quantization**: half of
 * its last retained digit, 0.005, as an ABSOLUTE bound. That is exactly the error
 * its rounding can introduce and not one part more.
 *
 * This is still a brutally tight test. The bugs it exists to catch — Wilder's
 * α=1/n mistaken for the EMA's 2/(n+1), or MFI smoothed with Wilder instead of
 * summed — move RSI by several POINTS. They would miss 0.005 by a factor of a
 * thousand. There is no room in here for a real bug to hide.
 */
const REFERENCE_ROUNDS_TO_2DP = 0.005 + 1e-9;

/** Compare our series against the reference, aligned from the end. */
function agree(
  ours: readonly Maybe[],
  reference: readonly number[],
  tolerance: number,
  label: string,
  mode: "relative" | "absolute" = "relative",
): void {
  const defined = ours.filter((v): v is number => v !== null);

  expect(
    defined.length,
    `${label}: we produced no values at all`,
  ).toBeGreaterThan(0);

  /*
   * The reference libraries emit ONLY the defined values (no leading nulls), so
   * their array is shorter than ours. Aligning from the END pairs the last value
   * with the last, which is the only alignment that is unambiguous — and the last
   * value is the one a strategy actually reads.
   */
  const compared = Math.min(defined.length, reference.length);
  expect(compared, `${label}: reference produced nothing`).toBeGreaterThan(0);

  const oursTail = defined.slice(-compared);
  const referenceTail = reference.slice(-compared);

  for (let i = 0; i < compared; i++) {
    const a = oursTail[i];
    const b = referenceTail[i];

    const scale =
      mode === "absolute" ? 1 : Math.max(Math.abs(a), Math.abs(b), 1);
    const difference = Math.abs(a - b) / scale;

    expect(
      difference,
      `${label}: bar ${i} of ${compared} — we say ${a}, the reference says ${b}`,
    ).toBeLessThan(tolerance);
  }
}

function run(indicator: IIndicator, candles: Candle[], params = {}): Maybe[] {
  return indicator.compute({
    candles,
    params: { ...indicator.defaults, ...params },
  });
}

const SUITES: { name: string; candles: Candle[] }[] = [
  { name: "trending", candles: TRENDING_UP },
  { name: "ranging", candles: RANGING },
  { name: "volatile", candles: VOLATILE },
];

describe.each(SUITES)("$name market — cross-checked against `technicalindicators`", ({ name, candles }) => {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  it("SMA(20)", () => {
    agree(
      run(smaCalculator, candles, { period: 20 }),
      SMA.calculate({ period: 20, values: closes }),
      CLOSED_FORM,
      `SMA/${name}`,
    );
  });

  it("EMA(20) — seeded with an SMA, not with the first value", () => {
    agree(
      run(emaCalculator, candles, { period: 20 }),
      EMA.calculate({ period: 20, values: closes }),
      RECURSIVE,
      `EMA/${name}`,
    );
  });

  it("RSI(14) — WILDER smoothing, not EMA", () => {
    // Compared within the reference's own 2dp quantization (see the note above —
    // it rounds internally and cannot be told not to). If we had used α = 2/(n+1)
    // instead of Wilder's 1/n, this fails by several POINTS of RSI, which is a
    // thousand times this bound.
    agree(
      run(rsiCalculator, candles, { period: 14 }),
      RSI.calculate({ period: 14, values: closes }),
      REFERENCE_ROUNDS_TO_2DP,
      `RSI/${name}`,
      "absolute",
    );
  });

  it("ATR(14) — the number every stop and position size is built on", () => {
    agree(
      run(atrCalculator, candles, { period: 14 }),
      ATR.calculate({ period: 14, high: highs, low: lows, close: closes }),
      RECURSIVE,
      `ATR/${name}`,
    );
  });

  it("MACD(12,26,9) — line, signal and histogram", () => {
    const reference = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    agree(
      run(macdLineCalculator, candles),
      reference.map((r) => r.MACD!).filter((v) => v !== undefined),
      RECURSIVE,
      `MACD line/${name}`,
    );

    const signals = reference
      .filter((r) => r.signal !== undefined)
      .map((r) => r.signal!);

    agree(run(macdSignalCalculator, candles), signals, RECURSIVE, `MACD signal/${name}`);

    const histograms = reference
      .filter((r) => r.histogram !== undefined)
      .map((r) => r.histogram!);

    agree(
      run(macdHistogramCalculator, candles),
      histograms,
      RECURSIVE,
      `MACD histogram/${name}`,
    );
  });

  it("Bollinger(20, 2) — POPULATION deviation, not sample", () => {
    const reference = BollingerBands.calculate({
      period: 20,
      stdDev: 2,
      values: closes,
    });

    agree(
      run(bbUpperCalculator, candles),
      reference.map((r) => r.upper),
      CLOSED_FORM,
      `BB upper/${name}`,
    );
    agree(
      run(bbMiddleCalculator, candles),
      reference.map((r) => r.middle),
      CLOSED_FORM,
      `BB middle/${name}`,
    );
    agree(
      run(bbLowerCalculator, candles),
      reference.map((r) => r.lower),
      CLOSED_FORM,
      `BB lower/${name}`,
    );
  });

  it("ADX(14) — and the +DM/−DM exclusivity rule", () => {
    const reference = ADX.calculate({
      period: 14,
      high: highs,
      low: lows,
      close: closes,
    });

    agree(
      run(adxCalculator, candles, { period: 14 }),
      reference.map((r) => r.adx),
      RECURSIVE,
      `ADX/${name}`,
    );
  });

  it("CCI(20) — MEAN deviation, not standard deviation", () => {
    // Substituting stdev for the mean absolute deviation (the natural mistake,
    // since `stdev` is right there) inflates CCI by roughly 25% and pushes it
    // across the ±100 lines the whole indicator is read against.
    agree(
      run(cciCalculator, candles, { period: 20 }),
      CCI.calculate({ period: 20, high: highs, low: lows, close: closes }),
      CLOSED_FORM,
      `CCI/${name}`,
    );
  });

  it("Williams %R(14)", () => {
    agree(
      run(williamsRCalculator, candles, { period: 14 }),
      WilliamsR.calculate({ period: 14, high: highs, low: lows, close: closes }),
      CLOSED_FORM,
      `Williams %R/${name}`,
    );
  });

  it("MFI(14) — simple sums, NOT Wilder", () => {
    agree(
      run(mfiCalculator, candles, { period: 14 }),
      MFI.calculate({
        period: 14,
        high: highs,
        low: lows,
        close: closes,
        volume: volumes,
      }),
      REFERENCE_ROUNDS_TO_2DP,
      `MFI/${name}`,
      "absolute",
    );
  });

  it("Stochastic(14, 3, 3) — %K is the SMOOTHED line, not the raw one", () => {
    const reference = Stochastic.calculate({
      period: 14,
      signalPeriod: 3,
      high: highs,
      low: lows,
      close: closes,
    });

    /*
     * `technicalindicators` reports RAW %K in its `k` field — it does not apply the
     * 3-period smoothing that TradingView (and we) call %K. Its `d` field is an
     * SMA(3) of that raw k, which is precisely OUR %K.
     *
     * So the correct comparison is: their `d` against our `stoch_k`. This is not a
     * fudge to make a test pass — it is the well-known off-by-one-smoothing
     * disagreement between libraries, and getting it backwards is exactly the bug
     * this file exists to catch. TradingView's %K is smoothed; ours matches
     * TradingView.
     */
    agree(
      run(stochKCalculator, candles),
      reference.map((r) => r.d).filter((v): v is number => v !== undefined),
      CLOSED_FORM,
      `Stoch %K/${name}`,
    );
  });
});

/**
 * Stochastic %D deserves its own check.
 *
 * Ours is an SMA(3) of our %K — which is itself an SMA(3) of raw %K. The reference
 * library has no equivalent of that double smoothing, so instead of comparing
 * against it we verify the RELATIONSHIP: %D must be the 3-period average of %K.
 * A self-consistency check, and it catches the thing that actually goes wrong here
 * (accidentally smoothing the raw line twice, or not at all).
 */
describe("Stochastic %D is an SMA(3) of %K", () => {
  it("holds on trending data", () => {
    const k = run(stochKCalculator, TRENDING_UP);
    const d = run(stochDCalculator, TRENDING_UP);

    for (let i = 20; i < TRENDING_UP.length; i++) {
      const window = [k[i], k[i - 1], k[i - 2]];
      if (window.some((v) => v === null) || d[i] === null) continue;

      const expected =
        (window as number[]).reduce((sum, v) => sum + v, 0) / 3;

      expect(Math.abs((d[i] as number) - expected)).toBeLessThan(1e-9);
    }
  });
});
