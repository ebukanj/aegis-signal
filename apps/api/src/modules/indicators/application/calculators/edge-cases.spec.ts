import { describe, expect, it } from "vitest";
import type { Candle } from "@aegis/contracts";
import {
  HAND_CHECKABLE,
  ILLIQUID,
  NO_TAKER_VOLUME,
  RANGING,
  TRENDING_UP,
  DATASETS,
} from "../../testing/datasets";
import {
  closeCalculator,
  cvdCalculator,
  emaCalculator,
  obvCalculator,
  smaCalculator,
  volumeSmaCalculator,
  vwapCalculator,
} from "./price-volume.calculators";
import {
  cciCalculator,
  kdjJCalculator,
  mfiCalculator,
  rsiCalculator,
  stochKCalculator,
  williamsRCalculator,
} from "./momentum.calculators";
import { adxCalculator, psarCalculator, supertrendCalculator } from "./trend.calculators";
import {
  atrCalculator,
  bbWidthCalculator,
  highestHighCalculator,
  zscoreCalculator,
} from "./volatility.calculators";
import type { IIndicator } from "../../domain/indicator.interface";
import { FeedUnavailableError } from "../../domain/indicator.errors";
import { fundingRateCalculator } from "./volatility.calculators";
import type { Maybe } from "../math/rolling";

function run(indicator: IIndicator, candles: readonly Candle[], params = {}): Maybe[] {
  return indicator.compute({
    candles,
    params: { ...indicator.defaults, ...params },
  });
}

/**
 * THE DEAD MARKET.
 *
 * Every divide-by-zero in this module lives here — flat ranges, zero volume,
 * identical highs and lows. This is the dataset that finds the bugs, and it is the
 * one that never appears in a tutorial.
 *
 * The rule these tests enforce: **an indicator may return null. It may never
 * return NaN or Infinity.**
 *
 * A NaN loose in a strategy is the worst failure this engine can produce, and it
 * is completely silent: `NaN > 30` is false, and `NaN < 30` is ALSO false. So
 * every condition evaluates to "not met", the strategy stops firing, and nothing —
 * no error, no log, no alert — says why. It just quietly stops working.
 */
describe("a dead, illiquid market produces no NaN and no Infinity", () => {
  const CALCULATORS: IIndicator[] = [
    smaCalculator,
    emaCalculator,
    volumeSmaCalculator,
    obvCalculator,
    cvdCalculator,
    vwapCalculator,
    rsiCalculator,
    stochKCalculator,
    cciCalculator,
    williamsRCalculator,
    mfiCalculator,
    kdjJCalculator,
    adxCalculator,
    supertrendCalculator,
    psarCalculator,
    atrCalculator,
    bbWidthCalculator,
    zscoreCalculator,
    highestHighCalculator,
  ];

  it.each(CALCULATORS.map((c) => [c.name, c] as const))(
    "%s survives flat bars and zero volume",
    (name, calculator) => {
      const values = run(calculator, ILLIQUID);

      for (const [i, value] of values.entries()) {
        if (value === null) continue;

        expect(
          Number.isFinite(value),
          `${name} produced ${value} at bar ${i} — a non-finite value silently makes EVERY strategy comparison false`,
        ).toBe(true);
      }
    },
  );

  it("Stochastic %K reports 50 on a frozen range, not 0", () => {
    // A flat window is a division by zero. Most libraries return 0, which reads as
    // "maximally OVERSOLD" — on a bar where price did not move at all. A strategy
    // buying oversold would buy a market that is not trading.
    const flat: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      time: Date.UTC(2026, 0, 1) + i * 3_600_000,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 10,
      takerBuyVolume: 5,
    }));

    const values = run(stochKCalculator, flat).filter((v) => v !== null);

    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => v === 50)).toBe(true);
  });

  it("Williams %R reports −50 on a frozen range, not −100", () => {
    const flat: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      time: Date.UTC(2026, 0, 1) + i * 3_600_000,
      open: 50,
      high: 50,
      low: 50,
      close: 50,
      volume: 1,
      takerBuyVolume: 0.5,
    }));

    const values = run(williamsRCalculator, flat).filter((v) => v !== null);
    expect(values.every((v) => v === -50)).toBe(true);
  });

  it("Z-score is NULL on a frozen range, not 0", () => {
    // 0 means "exactly at the mean" — a real statement about a market. Undefined
    // is the truth when there is no deviation to divide by.
    const flat: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      time: Date.UTC(2026, 0, 1) + i * 3_600_000,
      open: 7,
      high: 7,
      low: 7,
      close: 7,
      volume: 1,
      takerBuyVolume: 0.5,
    }));

    expect(run(zscoreCalculator, flat).every((v) => v === null)).toBe(true);
  });
});

/**
 * CVD, and the null that keeps a strategy honest.
 */
describe("CVD is null when the exchange does not publish taker-buy volume", () => {
  it("returns null for EVERY bar rather than a fabricated zero", () => {
    const values = run(cvdCalculator, NO_TAKER_VOLUME);

    // A zero delta would CLAIM "buyers and sellers were exactly balanced" — a
    // statement about the market that Support Reclaim would trade on. Bybit simply
    // does not tell us, and null is the only honest answer.
    expect(values.every((v) => v === null)).toBe(true);
    expect(values.some((v) => v === 0)).toBe(false);
  });

  it("computes a real running delta when the data IS there", () => {
    const values = run(cvdCalculator, TRENDING_UP).filter((v) => v !== null);

    expect(values.length).toBe(TRENDING_UP.length);
    // A real CVD moves. A flat one would mean our taker split was exactly 50/50,
    // which would mean the fixture — not the market — was doing the talking.
    expect(new Set(values).size).toBeGreaterThan(10);
  });

  it("distinguishes buying pressure from selling pressure", () => {
    const buying: Candle[] = Array.from({ length: 10 }, (_, i) => ({
      time: Date.UTC(2026, 0, 1) + i * 3_600_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 100,
      takerBuyVolume: 90, // buyers lifting the ask
    }));

    const selling = buying.map((c) => ({ ...c, takerBuyVolume: 10 }));

    const buyingCvd = run(cvdCalculator, buying).at(-1)!;
    const sellingCvd = run(cvdCalculator, selling).at(-1)!;

    expect(buyingCvd).toBeGreaterThan(0);
    expect(sellingCvd).toBeLessThan(0);

    /*
     * The point of CVD, in one assertion.
     *
     * These two sets of candles are IDENTICAL in OHLCV — same open, same close,
     * same volume, every bar. OBV cannot tell them apart, because OBV only knows
     * where the bar closed. CVD says one was 90% aggressive buying and the other
     * 90% aggressive selling.
     */
    const obvBuying = run(obvCalculator, buying).at(-1);
    const obvSelling = run(obvCalculator, selling).at(-1);
    expect(obvBuying).toBe(obvSelling);
  });
});

/**
 * WARMUP — the nulls that are not missing values but honest answers.
 */
describe("warmup: an indicator with too little history says null, never a number", () => {
  it("EMA(200) on 50 bars is null throughout — not an EMA(50) in disguise", () => {
    const short = TRENDING_UP.slice(0, 50);
    const values = run(emaCalculator, short, { period: 200 });

    // Most libraries return an EMA of whatever they have. That number is entirely
    // plausible and it is not the 200 EMA. A strategy asking "is price above the
    // 200 EMA" on a coin listed a week ago gets a confident answer to a question
    // that has none.
    expect(values.every((v) => v === null)).toBe(true);
  });

  it("SMA(20) is null for exactly 19 bars, then defined", () => {
    const values = run(smaCalculator, TRENDING_UP, { period: 20 });

    expect(values.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(values[19]).not.toBeNull();
  });

  it("the first value is never 0 where it should be null", () => {
    // A 0 would be read by a strategy as "price is above the 200 EMA" — which on a
    // fresh listing is how a careful-looking rule buys the top of a pump.
    for (const calculator of [smaCalculator, emaCalculator, rsiCalculator, atrCalculator]) {
      const values = run(calculator, TRENDING_UP, { period: 30 });
      expect(values[0], `${calculator.name} bar 0`).toBeNull();
    }
  });
});

/**
 * DETERMINISM. The property calibration rests on (ADR-024).
 */
describe("determinism: identical candles produce byte-identical output", () => {
  it.each(Object.entries(DATASETS))("%s", (_name, candles) => {
    for (const calculator of [rsiCalculator, emaCalculator, atrCalculator, adxCalculator, supertrendCalculator]) {
      const first = run(calculator, candles);
      const second = run(calculator, candles);

      // Not `toBeCloseTo`. IDENTICAL. A replay that does not reproduce is not a
      // replay, and a confidence score calibrated against a non-reproducible
      // engine is calibrated against noise.
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });
});

/**
 * HAND-CHECKABLE GOLDEN MASTERS.
 *
 * Values verified with a calculator, not copied from the code's own output. A
 * fixture generated by running the code proves only that the code still does what
 * it did — bug included.
 */
describe("golden masters, verified by hand", () => {
  const closes = HAND_CHECKABLE.map((c) => c.close);

  it("close is the close", () => {
    expect(run(closeCalculator, HAND_CHECKABLE)).toEqual(closes);
  });

  it("SMA(3) — checked with mental arithmetic", () => {
    // closes: 10, 11, 12, 11, 10, 12, 14, 13, 15, 16
    const values = run(smaCalculator, HAND_CHECKABLE, { period: 3 });

    expect(values[0]).toBeNull();
    expect(values[1]).toBeNull();
    expect(values[2]).toBeCloseTo((10 + 11 + 12) / 3, 10); // 11
    expect(values[3]).toBeCloseTo((11 + 12 + 11) / 3, 10); // 11.333…
    expect(values[4]).toBeCloseTo((12 + 11 + 10) / 3, 10); // 11
    expect(values[9]).toBeCloseTo((13 + 15 + 16) / 3, 10); // 14.666…
  });

  it("EMA(3) — seeded with the SMA, then α = 2/(3+1) = 0.5", () => {
    const values = run(emaCalculator, HAND_CHECKABLE, { period: 3 });

    const seed = (10 + 11 + 12) / 3; // 11
    expect(values[2]).toBeCloseTo(seed, 10);

    // bar 3: 11 · 0.5 + 11 · 0.5 = 11
    expect(values[3]).toBeCloseTo(11 * 0.5 + seed * 0.5, 10);

    // bar 4: 10 · 0.5 + 11 · 0.5 = 10.5
    expect(values[4]).toBeCloseTo(10 * 0.5 + 11 * 0.5, 10);
  });

  it("highest high over 3 bars", () => {
    const values = run(highestHighCalculator, HAND_CHECKABLE, { period: 3 });
    const highs = HAND_CHECKABLE.map((c) => c.high);

    expect(values[2]).toBeCloseTo(Math.max(highs[0], highs[1], highs[2]), 10);
    expect(values[9]).toBeCloseTo(Math.max(highs[7], highs[8], highs[9]), 10);
  });

  it("OBV adds volume on up bars and subtracts it on down bars", () => {
    const values = run(obvCalculator, HAND_CHECKABLE);
    const volumes = HAND_CHECKABLE.map((c) => c.volume);

    // 10 → 11 is up; 11 → 12 is up; 12 → 11 is down.
    expect(values[1]).toBeCloseTo(volumes[1], 6);
    expect(values[2]).toBeCloseTo(volumes[1] + volumes[2], 6);
    expect(values[3]).toBeCloseTo(volumes[1] + volumes[2] - volumes[3], 6);
  });
});

/**
 * VWAP anchoring.
 */
describe("VWAP is anchored to the UTC day, not rolling", () => {
  it("resets at midnight UTC", () => {
    const values = run(vwapCalculator, TRENDING_UP);

    // TRENDING_UP starts exactly at 2026-01-01T00:00Z with hourly bars, so bar 24
    // is the first bar of a new UTC day — and its VWAP must equal its own typical
    // price, because it is the only bar in the session so far.
    const bar24 = TRENDING_UP[24];
    const typical = (bar24.high + bar24.low + bar24.close) / 3;

    expect(values[24]).toBeCloseTo(typical, 6);
  });

  it("the first bar of a session has a VWAP equal to its own typical price", () => {
    const first = TRENDING_UP[0];
    const typical = (first.high + first.low + first.close) / 3;

    expect(run(vwapCalculator, TRENDING_UP)[0]).toBeCloseTo(typical, 6);
  });
});

/**
 * The feed-dependent indicators.
 */
describe("indicators whose feed does not exist", () => {
  it("funding rate REFUSES rather than returning a plausible zero", () => {
    // Registered and present, so the platform knows it exists. Throwing rather
    // than returning 0 is the difference between "the strategy stands down" and
    // "the strategy trades on a funding rate of zero", which is a claim that the
    // market is perfectly balanced.
    expect(() => run(fundingRateCalculator, TRENDING_UP)).toThrow(
      FeedUnavailableError,
    );
  });
});

/**
 * Supertrend's ratchet — the property that makes it a usable trailing stop.
 */
describe("Supertrend ratchets and never gives ground", () => {
  it("the band only moves toward price while the trend holds", () => {
    const values = run(supertrendCalculator, TRENDING_UP, {
      period: 10,
      multiplier: 3,
    });

    const closes = TRENDING_UP.map((c) => c.close);

    let violations = 0;

    for (let i = 12; i < values.length; i++) {
      const now = values[i];
      const before = values[i - 1];
      if (now === null || before === null) continue;

      const wasBelow = before < closes[i - 1];
      const isBelow = now < closes[i];

      // While we remain in an uptrend (band below price both bars), the band must
      // never fall. A band that loosens as volatility rises is a stop that widens
      // exactly when the market becomes dangerous — backwards.
      if (wasBelow && isBelow && now < before - 1e-9) violations++;
    }

    expect(violations).toBe(0);
  });
});

/**
 * ADX must not report a strong trend in a market that has none.
 */
describe("ADX stays low in a range", () => {
  it("a sideways market does not read as a strong trend", () => {
    const values = run(adxCalculator, RANGING, { period: 14 }).filter(
      (v): v is number => v !== null,
    );

    const average = values.reduce((sum, v) => sum + v, 0) / values.length;

    /*
     * If the +DM/−DM exclusivity rule were broken — recording BOTH on an outside
     * bar — +DI and −DI would be simultaneously elevated, DX would stay high, and
     * ADX would report a roaring trend in a market oscillating around a mean. This
     * assertion is the trap for that bug.
     */
    expect(average).toBeLessThan(30);
  });

  it("a strong trend reads higher than a range", () => {
    const trending = run(adxCalculator, TRENDING_UP, { period: 14 }).filter(
      (v): v is number => v !== null,
    );
    const ranging = run(adxCalculator, RANGING, { period: 14 }).filter(
      (v): v is number => v !== null,
    );

    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

    expect(mean(trending)).toBeGreaterThan(mean(ranging));
  });
});
