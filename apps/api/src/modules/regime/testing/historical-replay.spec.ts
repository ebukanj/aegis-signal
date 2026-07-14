import { describe, expect, it } from "vitest";
import type { Candle, RegimeClassification } from "@aegis/contracts";
import { RegimeClassifier, type RegimeState } from "../application/classifiers/regime.classifier";
import { SwingEngine } from "../../patterns/application/services/swing.engine";
import { StructureEngine } from "../../patterns/application/services/structure.engine";
import {
  closeCalculator,
  emaCalculator,
  obvCalculator,
  vwapCalculator,
} from "../../indicators/application/calculators/price-volume.calculators";
import {
  cciCalculator,
  macdHistogramCalculator,
  rsiCalculator,
} from "../../indicators/application/calculators/momentum.calculators";
import {
  adxCalculator,
  minusDiCalculator,
  plusDiCalculator,
} from "../../indicators/application/calculators/trend.calculators";
import {
  atrCalculator,
  bbWidthCalculator,
} from "../../indicators/application/calculators/volatility.calculators";
import type { IIndicator } from "../../indicators/domain/indicator.interface";
import type { Maybe } from "../../indicators/application/math/rolling";
import type { FeatureInput } from "../domain/feature";
import history from "./history.json";

/**
 * HISTORICAL REPLAY — against markets that actually happened.
 *
 * Synthetic markets prove the classifier can read a market it was *designed* to
 * read. That is worth something, and it is not worth much: I wrote both the market
 * and the classifier, so of course they agree.
 *
 * These are **real Binance daily candles**, snapshotted into `history.json`:
 *
 *   BULL_2021      Oct 2020 → Apr 2021    $10,619 → $62,960   (+493%)
 *   BEAR_2022      Apr 2022 → Jul 2022    $46,283 → $19,942   (−57%)
 *   SIDEWAYS_2020  May 2020 → Jul 2020     $8,723 →  $9,538    (+9%, a 28% band)
 *   CRASH_2020     Feb 2020 → Mar 2020     $9,385 →  $6,162   (−34%, COVID)
 *
 * ── Why the ground truth here is not an opinion ──
 *
 * "There is no ground truth for a regime" is the reason `agreement` is not a
 * probability — and it is true at the level of *a given bar*. Nobody can tell you
 * what regime 14 March 2021 was in.
 *
 * But nobody sane disputes that **a 493% run is a bull market** or that **−57% in
 * ninety days is a bear market**. At the level of a whole PERIOD, the label is not a
 * judgement call, and that is the only level at which this test asserts anything.
 *
 * The first version of this fixture used Aug–Dec 2019 as the "sideways" period. It
 * fell 30%. That is a downtrend, and labelling it sideways to suit the test would
 * have been inventing ground truth — the exact mislabelled-fixture mistake the
 * Pattern Engine's `RANGING` sine wave already taught us. It was replaced with a
 * period that genuinely went nowhere.
 *
 * Data is SNAPSHOTTED rather than fetched. A test that hits the network is a test
 * that fails on a train, and a benchmark that changes under you is not a benchmark.
 */

const swingEngine = new SwingEngine();
const structureEngine = new StructureEngine();
const classifier = new RegimeClassifier();

const PERIODS = history as unknown as Record<string, Candle[]>;

function featuresFor(candles: Candle[]): FeatureInput {
  const run = (calc: IIndicator, params = {}): Maybe[] =>
    calc.compute({ candles, params: { ...calc.defaults, ...params } });

  const swings = swingEngine.detect(candles);

  return {
    candles,
    indicators: {
      close: run(closeCalculator),
      "ema:50": run(emaCalculator, { period: 50 }),
      "ema:200": run(emaCalculator, { period: 200 }),
      adx: run(adxCalculator),
      plus_di: run(plusDiCalculator),
      minus_di: run(minusDiCalculator),
      rsi: run(rsiCalculator),
      macd_histogram: run(macdHistogramCalculator),
      cci: run(cciCalculator),
      atr: run(atrCalculator),
      bb_width: run(bbWidthCalculator),
      obv: run(obvCalculator),
      vwap: run(vwapCalculator),
    },
    patterns: [],
    structure: structureEngine.analyse({
      candles,
      swings: swings.all,
      timeframe: "1d",
    }),
  };
}

/**
 * Replay the period bar by bar, exactly as the live engine would — feeding it only
 * the candles that had happened at the time.
 *
 * **This is the whole point of a replay.** Classifying the finished period in one
 * shot would let every bar see the future, which is the bias this platform refuses
 * everywhere else and would be absurd to permit here.
 */
function replay(candles: Candle[], warmup: number) {
  const seen: RegimeClassification[] = [];
  let state: RegimeState | null = null;

  for (let end = warmup; end < candles.length; end++) {
    // `step`, not `classify` — the engine's memory is what carries the hysteresis,
    // and a replay that dropped it would be testing a classifier that does not exist.
    state = classifier.step({
      features: featuresFor(candles.slice(0, end + 1)),
      timeframe: "1d",
      state,
    });

    seen.push(state.classification);
  }

  return seen;
}

/** What share of the replayed bars carried this direction? */
function share(
  seen: RegimeClassification[],
  direction: RegimeClassification["direction"],
): number {
  return seen.filter((c) => c.direction === direction).length / seen.length;
}

describe("historical replay — markets that actually happened", () => {
  it("the fixtures are the markets they claim to be", () => {
    // Guard against the fixture quietly changing under the assertions. A benchmark
    // that drifts is not a benchmark, and a "bull market" fixture that is secretly a
    // range would make every test below pass for the wrong reason.
    const move = (name: string) => {
      const c = PERIODS[name];
      return (c.at(-1)!.close - c[0].close) / c[0].close;
    };

    expect(move("BULL_2021")).toBeGreaterThan(3); // +493%
    expect(move("BEAR_2022")).toBeLessThan(-0.4); // −57%
    expect(Math.abs(move("SIDEWAYS_2020"))).toBeLessThan(0.2); // +9%
    expect(move("CRASH_2020")).toBeLessThan(-0.25); // −34%
  });

  it("classifies the 2020–21 BULL MARKET as TRENDING_BULL", () => {
    const seen = replay(PERIODS.BULL_2021, 60);

    // It ran +493%. If the engine cannot see that, nothing else it says matters.
    expect(
      share(seen, "TRENDING_BULL"),
      `only ${(share(seen, "TRENDING_BULL") * 100).toFixed(0)}% of the greatest bull run in the asset's history read as a bull trend`,
    ).toBeGreaterThan(0.6);

    // And it must never have called it a bear market.
    expect(share(seen, "TRENDING_BEAR")).toBe(0);
  });

  it("classifies the 2022 BEAR MARKET as bearish, never bullish", () => {
    const seen = replay(PERIODS.BEAR_2022, 40);

    const bearish =
      share(seen, "TRENDING_BEAR") + share(seen, "RISK_OFF");

    expect(
      bearish,
      `only ${(bearish * 100).toFixed(0)}% of a −57% collapse read as bearish`,
    ).toBeGreaterThan(0.5);

    /*
     * The assertion that would actually cost money.
     *
     * A regime engine that called the LUNA deleveraging a bull trend would have every
     * trend-following strategy on the platform buying it — with size, and with
     * confidence. Being merely "unsure" here is survivable. Being WRONG is not.
     */
    expect(
      share(seen, "TRENDING_BULL"),
      "the engine called part of a 57% collapse a BULL TREND",
    ).toBe(0);
  });

  it("classifies the mid-2020 chop as a RANGE, not a trend", () => {
    const seen = replay(PERIODS.SIDEWAYS_2020, 50);

    const trending =
      share(seen, "TRENDING_BULL") + share(seen, "TRENDING_BEAR");

    // It moved +9% across 76 days inside a 28% band. Calling that a trend would have
    // trend-following strategies firing into chop, which is where they go to die.
    expect(
      trending,
      `${(trending * 100).toFixed(0)}% of a flat, rangebound market read as a TREND`,
    ).toBeLessThan(0.35);
  });

  it("sees the COVID crash as RISK_OFF, not as an orderly downtrend", () => {
    const seen = replay(PERIODS.CRASH_2020, 25);

    /*
     * The distinction that matters most.
     *
     * March 2020 was not a bear trend — it was a liquidation cascade: −40% in a day,
     * volatility 5× normal, every level irrelevant, stops filling far from where they
     * were placed. TRENDING_BEAR is tradeable (you short the rallies). RISK_OFF is
     * not, and a platform that could not tell them apart would keep trading through
     * the one day it should have stood aside.
     */
    const riskOff = share(seen, "RISK_OFF");

    expect(
      riskOff,
      `the engine never once flagged RISK_OFF during the fastest crash in the asset's history`,
    ).toBeGreaterThan(0);

    expect(share(seen, "TRENDING_BULL")).toBe(0);
  });

  it("does NOT thrash — regimes hold across real markets", () => {
    /*
     * The stability check, on real data rather than synthetic.
     *
     * A classifier that flips every few bars re-permissions every strategy on the
     * platform as it goes. Across 136 bars of the cleanest bull market in the asset's
     * history, the regime should change a handful of times at most.
     */
    for (const [name, warmup] of [
      ["BULL_2021", 60],
      ["BEAR_2022", 40],
    ] as const) {
      const seen = replay(PERIODS[name], warmup);

      let flips = 0;
      for (let i = 1; i < seen.length; i++) {
        if (seen[i].direction !== seen[i - 1].direction) flips++;
      }

      const rate = flips / seen.length;

      expect(
        rate,
        `${name}: the regime changed ${flips} times across ${seen.length} bars (${(rate * 100).toFixed(0)}% of bars)`,
      ).toBeLessThan(0.12);
    }
  });

  it("is DETERMINISTIC across a full replay", () => {
    // Calibration replays history (ADR-024). A replay that does not reproduce is not
    // a replay.
    const a = replay(PERIODS.BEAR_2022, 40);
    const b = replay(PERIODS.BEAR_2022, 40);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("EVERY classification is stamped UNCALIBRATED, even on data we know the answer to", () => {
    /*
     * Especially here.
     *
     * We know 2021 was a bull market — but the engine did not *learn* that, and it
     * cannot tell you the probability that it is right about tomorrow. Passing a
     * historical benchmark is not calibration, and a platform that let a green
     * benchmark upgrade its confidence label would be doing exactly what it forbids
     * everywhere else.
     */
    for (const classification of replay(PERIODS.BULL_2021, 60)) {
      expect(classification.calibration).toBe("UNCALIBRATED");
    }
  });
});
