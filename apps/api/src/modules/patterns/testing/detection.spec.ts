import { beforeEach, describe, expect, it } from "vitest";
import type { Candle } from "@aegis/contracts";
import { SwingEngine } from "../application/services/swing.engine";
import { StructureEngine } from "../application/services/structure.engine";
import { ZoneEngine } from "../application/services/zone.engine";
import { QualityEngine } from "../application/services/quality.engine";
import { higherHighHigherLowDetector } from "../application/detectors/structure.detectors";
import {
  fairValueGapDetector,
  liquiditySweepDetector,
} from "../application/detectors/liquidity.detectors";
import { fitTrendline } from "../application/geometry/trendline";
import type { DetectionContext } from "../domain/pattern.interface";

/**
 * The other half of the bargain.
 *
 * The false-positive suite proves the engine does not invent patterns. These tests
 * prove it can actually FIND one — because a detector that returns nothing, ever,
 * would pass every single test in that file with flying colours.
 *
 * The patterns here are hand-built, unambiguous, and would be marked on a chart by
 * any trader without hesitation. If the engine misses these, it is not conservative;
 * it is blind.
 */

const swingEngine = new SwingEngine();
const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);

/** Build candles from closes, with controllable wick size and volume. */
function build(
  closes: number[],
  options: { wick?: number; volume?: (i: number) => number } = {},
): Candle[] {
  const wick = options.wick ?? 0.002;

  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    const volume = options.volume?.(i) ?? 1_000;

    return {
      time: START + i * HOUR,
      open,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
      close,
      volume,
      takerBuyVolume: volume * 0.5,
    };
  });
}

function contextFor(candles: Candle[]): DetectionContext {
  const swings = swingEngine.detect(candles);

  const relativeVolume = candles.map((candle, i) => {
    if (i < 20) return null;

    let sum = 0;
    for (let j = i - 20; j < i; j++) sum += candles[j].volume;

    const average = sum / 20;
    return average > 0 ? candle.volume / average : null;
  });

  return { candles, swings: swings.all, timeframe: "1h", relativeVolume };
}

/** A clean zigzag: alternating swings, each leg a fixed percentage. */
function zigzag(
  legs: number[],
  barsPerLeg = 6,
  start = 100,
): number[] {
  const closes: number[] = [start];
  let price = start;

  for (const leg of legs) {
    const target = price * (1 + leg);

    for (let i = 1; i <= barsPerLeg; i++) {
      closes.push(price + ((target - price) * i) / barsPerLeg);
    }

    price = target;
  }

  return closes;
}

/* ── Swings ────────────────────────────────────────────────────────── */

describe("the swing engine", () => {
  it("finds the obvious swings in a zigzag", () => {
    const candles = build(zigzag([0.1, -0.06, 0.12, -0.07, 0.09]));
    const swings = swingEngine.detect(candles, 3);

    expect(swings.highs.length).toBeGreaterThanOrEqual(2);
    expect(swings.lows.length).toBeGreaterThanOrEqual(2);
  });

  it("NEVER reports a swing in the unconfirmed tail", () => {
    /*
     * The look-ahead guard, and the most important assertion about swings.
     *
     * A pivot needs `strength` bars AFTER it that failed to exceed it. Those bars do
     * not exist yet at the right-hand edge of the chart, so the last `strength` bars
     * can never contain a confirmed swing. An engine that reports one there is
     * reporting a swing it cannot know about — and it will backtest beautifully,
     * because in a backtest those bars are already sitting there.
     */
    const candles = build(zigzag([0.1, -0.06, 0.12, -0.07, 0.2]));
    const strength = 5;

    const swings = swingEngine.detect(candles, strength);
    const lastAllowed = candles.length - strength - 1;

    for (const swing of swings.all) {
      expect(
        swing.index,
        "a swing was reported in the unconfirmed tail — this is look-ahead bias",
      ).toBeLessThanOrEqual(lastAllowed);
    }
  });

  it("measures prominence — the difference between a swing and a wiggle", () => {
    const big = build(zigzag([0.15, -0.12, 0.15]));
    const tiny = build(zigzag([0.004, -0.003, 0.004]));

    const bigSwings = swingEngine.detect(big, 3);
    const tinySwings = swingEngine.detect(tiny, 3);

    const meanProminence = (xs: { prominence: number }[]) =>
      xs.reduce((s, x) => s + x.prominence, 0) / Math.max(1, xs.length);

    expect(meanProminence(bigSwings.all)).toBeGreaterThan(
      meanProminence(tinySwings.all) * 3,
    );
  });

  it("clusters swings at the same level into ONE level", () => {
    // Three highs at effectively the same price. That is one ceiling defended three
    // times, not three separate weak ceilings.
    const candles = build(
      zigzag([0.1, -0.05, 0.0501, -0.05, 0.0501, -0.05]),
    );

    const swings = swingEngine.detect(candles, 3);
    const clusters = swingEngine.cluster(swings.all, "HIGH", 0.01);

    const biggest = clusters.reduce(
      (max, c) => (c.members.length > max.members.length ? c : max),
      clusters[0],
    );

    expect(biggest.members.length).toBeGreaterThanOrEqual(2);
  });
});

/* ── Structure ─────────────────────────────────────────────────────── */

describe("market structure", () => {
  let structure: StructureEngine;

  beforeEach(() => {
    structure = new StructureEngine();
  });

  it("reads a clean uptrend as an UPTREND", () => {
    // Higher highs AND higher lows.
    const candles = build(zigzag([0.1, -0.04, 0.12, -0.05, 0.14, -0.04]));
    const swings = swingEngine.detect(candles, 3);

    const state = structure.analyse({
      candles,
      swings: swings.all,
      timeframe: "1h",
    });

    expect(state.trend).toBe("UPTREND");
  });

  it("reads a clean downtrend as a DOWNTREND", () => {
    const candles = build(zigzag([-0.1, 0.04, -0.12, 0.05, -0.14, 0.04]));
    const swings = swingEngine.detect(candles, 3);

    const state = structure.analyse({
      candles,
      swings: swings.all,
      timeframe: "1h",
    });

    expect(state.trend).toBe("DOWNTREND");
  });

  it("HIGHER HIGHS WITH LOWER LOWS IS NOT AN UPTREND", () => {
    /*
     * The assertion that separates a structural definition from a momentum one.
     *
     * A market making higher highs AND lower lows is an EXPANDING range — one of the
     * most dangerous things to trade with a trend rule, because volatility is
     * widening in both directions and a stop sized for yesterday is about to be
     * noise. An engine that requires only higher highs would call this an uptrend
     * and buy it.
     */
    const closes = zigzag([0.1, -0.14, 0.18, -0.22, 0.26]);
    const candles = build(closes);
    const swings = swingEngine.detect(candles, 3);

    const state = structure.analyse({
      candles,
      swings: swings.all,
      timeframe: "1h",
    });

    expect(state.trend).not.toBe("UPTREND");
  });

  it("detects a BREAK OF STRUCTURE on a close beyond the swing high", () => {
    const candles = build(zigzag([0.1, -0.04, 0.12, -0.05, 0.14]));
    const context = contextFor(candles);

    const found = higherHighHigherLowDetector.detect(context);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].quality).toBe(1); // objective. It happened.
    expect(found[0].direction).toBe("LONG");
  });

  it("a WICK through a swing is NOT a break — that is a sweep", () => {
    /*
     * The single decision that separates a structure engine that works from one that
     * fires on every stop hunt.
     *
     * If a wick counted as a break, the engine would report a change of character on
     * the very bar the market was DEFENDING the level — inverting the meaning
     * entirely. The Structure Engine and the LiquiditySweep detector are exact
     * complements: exactly one of them is right about any given bar.
     */
    /*
     * TWO EQUAL LOWS — a pool of stops.
     *
     * This test originally used a zigzag whose lows were all at different prices,
     * and the sweep detector correctly found NOTHING. That is the fix working: a
     * "sweep" of a single, never-retested swing is not a sweep, because there is no
     * liquidity resting under a level nobody has traded off. Stops pile up under
     * levels price has already visited.
     *
     * So: price falls to 100, bounces, falls to 100 again (the pool), bounces — and
     * only THEN is there anything worth sweeping.
     */
    /*
     * And the sweep must come LATER — outside the pivot's confirmation window.
     *
     * A second subtlety this test surfaced, and it is a genuine property of the
     * engine rather than a workaround. A pivot low is confirmed by the `strength`
     * bars on EITHER side of it. If a bar wicks below that low while still inside
     * its right-hand window, the low is not a pivot at all any more — a lower low
     * now exists within its own confirmation range.
     *
     * So the engine cannot report a sweep of a level that formed three bars ago —
     * and it SHOULD not. A level nobody has had time to place a stop under has no
     * liquidity resting beneath it. The lag is the same one every confirmed swing
     * carries, and it is the price of the swing being real.
     */
    const closes = [
      110, 108, 106, 104, 102, 100, // a low at 100
      102, 104, 106, 108, 107, 105, // a bounce
      103, 101, 100.1, 100, // ...and back to the SAME low. Equal lows — the pool.
      102, 104, 106, 107, 108, 107, 106, // it rallies away, confirming the low
    ];

    const candles = build(closes);

    const swings = swingEngine.detect(candles, 3);
    const lastLow = swings.lows.at(-1)!;

    // A bar that wicks far below the pooled low but CLOSES back above it.
    const swept: Candle = {
      time: candles.at(-1)!.time + HOUR,
      open: candles.at(-1)!.close,
      high: candles.at(-1)!.close * 1.002,
      low: lastLow.price * 0.96, // deep below the stops
      close: candles.at(-1)!.close, // and decisively back inside
      volume: 3_000,
      takerBuyVolume: 2_400,
    };

    const withSweep = [...candles, swept];
    const context = contextFor(withSweep);

    const state = structure.analyse({
      candles: withSweep,
      swings: context.swings,
      timeframe: "1h",
    });

    // The level was defended, not broken.
    expect(state.changedCharacter).toBe(false);

    // And the sweep detector is the one that should see it.
    const sweeps = liquiditySweepDetector.detect(context);
    expect(sweeps.length).toBeGreaterThan(0);
    expect(sweeps[0].direction).toBe("LONG"); // stops taken below → bullish
  });
});

/* ── Zones ─────────────────────────────────────────────────────────── */

describe("zones", () => {
  let zoneEngine: ZoneEngine;

  beforeEach(() => {
    zoneEngine = new ZoneEngine(new SwingEngine());
  });

  it("finds a level that price defended repeatedly", () => {
    // Price rejects three times from ~110.
    const candles = build(zigzag([0.1, -0.05, 0.0501, -0.05, 0.0501, -0.05]));
    const swings = swingEngine.detect(candles, 3);

    const zones = zoneEngine.detect({
      candles,
      swings: swings.all,
      timeframe: "1h",
    });

    expect(zones.length).toBeGreaterThan(0);

    // A zone is a BAND, never a line.
    for (const zone of zones) {
      expect(zone.high).toBeGreaterThanOrEqual(zone.low);
    }
  });

  it("MORE RETESTS DOES NOT MEAN STRONGER — a level gets worn down", () => {
    /*
     * The classic error, inverted.
     *
     * A level tested twice and holding is strong. A level tested SEVEN times is being
     * worn down — each test consumes the resting orders that made it a level. Traders
     * know this instinctively; a naive `strength = retests / 10` gets it exactly
     * backwards, and would rank the level most likely to break as the strongest one
     * on the chart.
     */
    const engine = new ZoneEngine(new SwingEngine());

    // Reach into the scoring via a zone with many touches vs few.
    const fewTouches = build(zigzag([0.1, -0.05, 0.0501, -0.05]));
    const manyTouches = build(
      zigzag([0.1, -0.05, 0.0501, -0.05, 0.0501, -0.05, 0.0501, -0.05, 0.0501, -0.05]),
    );

    const zonesFew = engine.detect({
      candles: fewTouches,
      swings: swingEngine.detect(fewTouches, 3).all,
      timeframe: "1h",
    });

    const zonesMany = engine.detect({
      candles: manyTouches,
      swings: swingEngine.detect(manyTouches, 3).all,
      timeframe: "1h",
    });

    const best = (zs: { strength: number }[]) =>
      zs.reduce((m, z) => Math.max(m, z.strength), 0);

    // Not asserting many < few exactly (other factors move too) — asserting that
    // heavy testing does NOT monotonically increase strength, which a naive
    // implementation would guarantee.
    expect(best(zonesMany)).toBeLessThanOrEqual(best(zonesFew) + 0.2);
  });
});

/* ── The detectors find real patterns ──────────────────────────────── */

describe("the detectors find patterns that are actually there", () => {
  it("finds a FAIR VALUE GAP where the market genuinely gapped", () => {
    const candles: Candle[] = [];

    for (let i = 0; i < 30; i++) {
      const price = 100 + i * 0.05;

      candles.push({
        time: START + i * HOUR,
        open: price,
        high: price + 0.2,
        low: price - 0.2,
        close: price,
        volume: 1_000,
        takerBuyVolume: 500,
      });
    }

    // Three bars where the middle one runs so hard that bar 1's high is below
    // bar 3's low — a band of price at which no trading happened.
    const base = candles.at(-1)!.close;

    candles.push({
      time: START + 30 * HOUR,
      open: base,
      high: base + 0.2,
      low: base - 0.2,
      close: base,
      volume: 1_000,
      takerBuyVolume: 500,
    });
    candles.push({
      time: START + 31 * HOUR,
      open: base,
      high: base + 8,
      low: base - 0.2,
      close: base + 7.5,
      volume: 5_000,
      takerBuyVolume: 4_000,
    });
    candles.push({
      time: START + 32 * HOUR,
      open: base + 7.5,
      high: base + 9,
      low: base + 5, // ← well above bar 1's high of base + 0.2
      close: base + 8,
      volume: 3_000,
      takerBuyVolume: 2_000,
    });

    const found = fairValueGapDetector.detect(contextFor(candles));

    expect(found.length).toBeGreaterThan(0);
    expect(found[0].direction).toBe("LONG");
    expect(found[0].quality).toBe(1); // objective — the gap exists
    expect(found[0].evidence.join(" ")).toMatch(/imbalance/i);
  });

  it("every detection carries its WORKING — evidence, and weaknesses", () => {
    /*
     * The product promise, enforced.
     *
     * A pattern engine that returns `BULL_FLAG: true, quality: 0.87` is demanding
     * trust — a trader cannot agree or disagree with 0.87, only accept it. Every
     * detection must show why, in words a human can push back on.
     */
    const candles = build(zigzag([0.1, -0.04, 0.12, -0.05, 0.14]));
    const context = contextFor(candles);

    const found = higherHighHigherLowDetector.detect(context);
    expect(found.length).toBeGreaterThan(0);

    const pattern = found[0];

    expect(pattern.evidence.length).toBeGreaterThan(0);
    expect(pattern.evidence[0].length).toBeGreaterThan(20);

    // And its working: the swings it actually used.
    expect(pattern.swings.length).toBeGreaterThan(0);
  });
});

/* ── Geometry ──────────────────────────────────────────────────────── */

describe("trendline geometry", () => {
  const swing = (index: number, price: number) => ({
    index,
    price,
    time: START + index * HOUR,
    kind: "HIGH" as const,
    strength: 3,
    age: 0,
    prominence: 0.02,
  });

  it("fits a perfect line at R² = 1", () => {
    const line = fitTrendline([swing(0, 100), swing(10, 110), swing(20, 120)]);

    expect(line).not.toBeNull();
    expect(line!.rSquared).toBeCloseTo(1, 6);
    expect(line!.slope).toBeCloseTo(1, 6);
  });

  it("gives a FLAT set of points R² = 1, not 0", () => {
    /*
     * The zero-variance trap.
     *
     * Three swings at exactly the same price is a perfectly flat top — real, common,
     * and the cleanest possible ceiling. R² is 0/0 there, and a naive implementation
     * returns 0, which makes the engine REJECT the best flat top it will ever see.
     */
    const line = fitTrendline([swing(0, 100), swing(10, 100), swing(20, 100)]);

    expect(line!.rSquared).toBe(1);
    expect(line!.slope).toBeCloseTo(0, 9);
  });

  it("scores a scattered set LOW — any two points make a line, but three need to agree", () => {
    const line = fitTrendline([
      swing(0, 100),
      swing(10, 130),
      swing(20, 105),
      swing(30, 128),
    ]);

    expect(line!.rSquared).toBeLessThan(0.4);
  });
});

/* ── Quality ───────────────────────────────────────────────────────── */

describe("the quality engine", () => {
  const engine = new QualityEngine();

  it("MULTIPLIES factors — one fatal flaw kills the score", () => {
    /*
     * The most important design decision in the quality engine.
     *
     * A bull flag with a textbook pole, textbook trendlines, and swings so shallow
     * they are indistinguishable from noise is not a "mostly good" flag. It is not a
     * flag. Averaging would score it 0.7 and ship it; the geometric mean scores it
     * near zero, which is the truth.
     *
     * Averaging lets two strong factors carry a fatal one — and in a system whose
     * output is a trade, that is the difference between a pattern and a Rorschach
     * test.
     */
    const withFatalFlaw = engine.score([
      { name: "a", value: 0.95, evidence: "excellent" },
      { name: "b", value: 0.95, evidence: "excellent" },
      { name: "c", value: 0.02, evidence: "", weakness: "fatal" },
    ]);

    const arithmeticMean = (0.95 + 0.95 + 0.02) / 3; // 0.64 — "acceptable"

    expect(withFatalFlaw.quality).toBeLessThan(0.35);
    expect(withFatalFlaw.quality).toBeLessThan(arithmeticMean);
    expect(withFatalFlaw.weaknesses).toContain("fatal");
  });

  it("stays readable — five good factors score good, not 0.33", () => {
    // A plain product would give 0.8^5 = 0.33, which reads as "bad" when every
    // component was good. The geometric mean keeps the multiplicative property while
    // staying on a human scale.
    const verdict = engine.score(
      Array.from({ length: 5 }, (_, i) => ({
        name: `f${i}`,
        value: 0.8,
        evidence: "good",
      })),
    );

    expect(verdict.quality).toBeCloseTo(0.8, 5);
  });

  it("always reports weaknesses when factors are weak", () => {
    const verdict = engine.score([
      { name: "a", value: 0.9, evidence: "strong" },
      { name: "b", value: 0.2, evidence: "", weakness: "the volume never showed up" },
    ]);

    expect(verdict.weaknesses).toContain("the volume never showed up");
  });
});
