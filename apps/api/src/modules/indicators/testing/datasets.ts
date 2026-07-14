import type { Candle } from "@aegis/contracts";

/**
 * The benchmark datasets.
 *
 * Every indicator is run against all of these. The point is not to check that the
 * numbers look plausible — it is to check the SHAPES where indicators break, and
 * they always break in the same places:
 *
 *   · a trend, where recursive indicators drift and stops get dragged
 *   · a range, where every oscillator whipsaws and Supertrend/PSAR flip endlessly
 *   · a crash, where True Range is dominated by gaps rather than bar bodies
 *   · a dead market, where divide-by-zero lives — flat ranges, zero volume,
 *     identical highs and lows
 *
 * The last one finds more bugs than the other three combined, and it is the one
 * that never appears in a tutorial's test data.
 *
 * ── Deterministic, seeded, no `Math.random()` ──
 *
 * A test that generates fresh random data each run is a test that fails once a
 * fortnight for a reason nobody can reproduce, and is then deleted. These use a
 * fixed seed: the same candles, on every machine, forever. That is also what makes
 * the golden masters meaningful — a golden value is only golden if the input is
 * fixed.
 */

/** Mulberry32. Small, fast, and — crucially — identical everywhere. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 60 * 60 * 1_000;
const START = Date.UTC(2026, 0, 1);

/**
 * Build a candle series from a close-price walk.
 *
 * The OHLC is derived so the invariants HOLD (high ≥ open/close ≥ low) — because a
 * fixture that violates them would be rejected by the validator and we would be
 * testing the validator, not the indicator.
 */
function build(
  closes: number[],
  options: { volume?: (i: number) => number; wick?: number; takerBuy?: boolean } = {},
): Candle[] {
  const wick = options.wick ?? 0.004;
  const random = seeded(99);

  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];

    const hi = Math.max(open, close) * (1 + wick * random());
    const lo = Math.min(open, close) * (1 - wick * random());

    const volume = options.volume ? options.volume(i) : 1_000 + random() * 500;

    return {
      time: START + i * HOUR,
      open,
      high: hi,
      low: lo,
      close,
      volume,
      // A realistic split — never exactly half, or CVD would be a flat line and
      // every CVD test would pass without testing anything.
      takerBuyVolume:
        options.takerBuy === false ? null : volume * (0.35 + random() * 0.3),
    };
  });
}

/** A clean uptrend with noise. Where trend indicators should be at their best. */
export const TRENDING_UP: Candle[] = build(
  Array.from({ length: 300 }, (_, i) => {
    const random = seeded(1 + i);
    return 100 * Math.exp(i * 0.004) + (random() - 0.5) * 1.5;
  }),
);

/** A downtrend. Not a mirror of the above — markets fall differently than they rise. */
export const TRENDING_DOWN: Candle[] = build(
  Array.from({ length: 300 }, (_, i) => {
    const random = seeded(500 + i);
    return 200 * Math.exp(-i * 0.005) + (random() - 0.5) * 2;
  }),
);

/**
 * A sideways range. The graveyard.
 *
 * Every oscillator whipsaws here, Supertrend and PSAR flip constantly, and ADX
 * should stay LOW — if it does not, the +DM/−DM exclusivity rule is broken.
 *
 * ── This was a sine wave, and a sine wave is not a range ──
 *
 * The first version of this fixture was `150 + sin(i/8)·6 + noise`. It looks
 * sideways on a chart and it is nothing of the sort: each half-cycle is a smooth,
 * persistent, 25-bar directional move — a clean little trend. ADX(14) read 42 on
 * it, and ADX was RIGHT. The fixture was lying, not the indicator (the
 * cross-check against `technicalindicators` agreed with us to 1e-6 on this very
 * data, which is how we knew where to look).
 *
 * A real range is MEAN-REVERTING and has no persistence: every move is pulled back
 * toward the middle, and the direction of the next bar tells you nothing about the
 * one after it. That is what kills trend indicators, and that is what this is now
 * — an Ornstein-Uhlenbeck walk with a strong pull and a lot of noise.
 *
 * The lesson generalises, and it is why this comment is long: **a mislabelled
 * fixture does not fail, it MISLEADS.** Every future test written against
 * `RANGING` would have been quietly asserting things about a trending market.
 */
export const RANGING: Candle[] = (() => {
  const random = seeded(1_000);
  const closes: number[] = [];

  const mean = 150;
  let price = mean;

  for (let i = 0; i < 300; i++) {
    const pull = (mean - price) * 0.35; // strong reversion — no direction survives
    const noise = (random() - 0.5) * 4;

    price += pull + noise;
    closes.push(price);
  }

  return build(closes);
})();

/**
 * A violent crash with gaps.
 *
 * True Range is dominated by the gaps here rather than by bar bodies — which is
 * the entire reason True Range exists, and the case where a naive `high - low`
 * implementation quietly under-reports risk by a factor of several. An ATR that is
 * too small is a stop that is too tight and a position that is too large.
 */
export const VOLATILE: Candle[] = (() => {
  const random = seeded(7_777);
  const closes: number[] = [];

  let price = 500;

  for (let i = 0; i < 300; i++) {
    const shock = random();

    if (shock > 0.94) price *= 0.88 + random() * 0.06; // a leg down
    else if (shock < 0.05) price *= 1.05 + random() * 0.05; // a violent bounce
    else price *= 0.995 + random() * 0.012;

    closes.push(price);
  }

  return build(closes, { wick: 0.03 });
})();

/**
 * A dead, illiquid market. **The dataset that finds the bugs.**
 *
 * Long flat stretches where high === low === open === close, and zero-volume bars.
 * This is where every divide-by-zero in the module lives:
 *
 *   · Stochastic's `(high - low)` range → 0
 *   · CCI's mean deviation → 0
 *   · Williams %R's range → 0
 *   · Bollinger's standard deviation → 0
 *   · Z-score's deviation → 0
 *   · MFI's positive and negative flows → both 0
 *   · ADX's true range → 0
 *
 * Every one of those has a documented answer in its calculator, and this dataset is
 * what proves the answer is the one that was documented rather than a NaN.
 */
export const ILLIQUID: Candle[] = (() => {
  const random = seeded(31_337);
  const candles: Candle[] = [];

  let price = 0.00042; // a genuinely small price — float precision matters here

  for (let i = 0; i < 300; i++) {
    const dead = random() > 0.55;

    if (dead) {
      // Nothing happened. Not "almost nothing" — nothing.
      candles.push({
        time: START + i * HOUR,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        takerBuyVolume: 0,
      });
      continue;
    }

    const open = price;
    price *= 0.97 + random() * 0.06;

    const volume = random() * 50;

    candles.push({
      time: START + i * HOUR,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      volume,
      takerBuyVolume: volume * random(),
    });
  }

  return candles;
})();

/** No taker-buy volume anywhere — Bybit's shape. CVD must return null, not zero. */
export const NO_TAKER_VOLUME: Candle[] = build(
  Array.from({ length: 100 }, (_, i) => 100 + i * 0.5),
  { takerBuy: false },
);

/**
 * A tiny, hand-checkable series.
 *
 * Ten closes, chosen so an SMA(3) can be verified with mental arithmetic. The
 * golden-master tests use this: a fixture you cannot verify by hand is a fixture
 * that enshrines whatever the code did on the day it was written, bug included.
 */
export const HAND_CHECKABLE: Candle[] = build([
  10, 11, 12, 11, 10, 12, 14, 13, 15, 16,
]);

export const DATASETS = {
  TRENDING_UP,
  TRENDING_DOWN,
  RANGING,
  VOLATILE,
  ILLIQUID,
} as const;

export type DatasetName = keyof typeof DATASETS;
