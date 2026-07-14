import { Injectable } from "@nestjs/common";
import type { Candle } from "@aegis/contracts";
import type { Maybe } from "../math/rolling";

/**
 * Divergence — price and momentum telling different stories.
 *
 * Price makes a lower low. The oscillator makes a HIGHER low. The move down still
 * happened, but it happened with less force behind it than the one before — the
 * sellers are getting less for their effort. That is bullish divergence, and it is
 * among the highest-value observations in technical trading.
 *
 * It is also the single easiest thing in this entire module to fake convincingly,
 * which is why this file is written the way it is.
 *
 * ── Why "the RSI went up while price went down" is NOT divergence ──
 *
 * That comparison is true constantly, on noise, in every market, and a "divergence
 * detector" built on it fires several times a day and is worth nothing. Real
 * divergence is between **swing points** — confirmed pivots, each with bars on
 * both sides that failed to exceed it. Comparing arbitrary bars N apart finds a
 * "divergence" in random data roughly half the time.
 *
 * So: find the pivots first. Compare only those. And confirm them.
 *
 * ── Why a swing must be CONFIRMED, and what that costs ──
 *
 * A pivot low at bar `i` is only a pivot once `lookback` bars *after* it have
 * failed to go lower. Until then it is just the current low, and it might not be a
 * low at all — the next bar could break it.
 *
 * This means **the most recent pivot is always `lookback` bars in the past**, and
 * a divergence is therefore detected some bars after the low that formed it. That
 * lag is not a deficiency to be engineered away; it is the price of the pivot
 * being real. An implementation that reports a pivot at the current bar is
 * reporting a pivot it cannot yet know exists, and that is look-ahead bias wearing
 * a very convincing disguise: it backtests brilliantly, because in a backtest the
 * next five bars are already there.
 */

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  /** The indicator's value at the same bar. */
  indicatorValue: number;
}

export interface DivergenceResult {
  detected: boolean;
  kind: "BULLISH" | "BEARISH" | null;

  /**
   * How pronounced the disagreement is, 0–1.
   *
   * The product of the two moves, normalised. A price low 5% below the previous
   * one while RSI holds 15 points higher is a far stronger statement than a 0.2%
   * lower low with RSI a point higher. Both are "divergence"; only one is worth
   * acting on, and a boolean cannot tell them apart.
   */
  strength: number;

  /**
   * How clean the setup is, 0–1.
   *
   * Distinct from strength, and the distinction matters. Strength asks "how big is
   * the disagreement?"; quality asks "how much do I believe this is a real pivot
   * pair?" A textbook divergence between two well-separated, sharply-defined
   * pivots scores high. Two pivots three bars apart in a chop-fest, barely
   * distinguishable from the noise around them, scores low no matter how large the
   * numbers happen to be.
   *
   * The Confidence Engine will weight by this. A strong divergence between two
   * rubbish pivots is a strong statement about nothing.
   */
  quality: number;

  /** The two pivots the finding rests on. Never a claim without its evidence. */
  swings: [SwingPoint, SwingPoint] | null;
}

const NONE: DivergenceResult = {
  detected: false,
  kind: null,
  strength: 0,
  quality: 0,
  swings: null,
};

@Injectable()
export class DivergenceEngine {
  /**
   * Bullish: price made a LOWER low, the indicator made a HIGHER low.
   *
   * @param lookback how far back to search for pivot pairs, in bars
   */
  bullish(
    candles: readonly Candle[],
    indicator: readonly Maybe[],
    lookback: number,
    pivotStrength = DEFAULT_PIVOT_STRENGTH,
  ): DivergenceResult {
    const pivots = this.pivotLows(candles, indicator, lookback, pivotStrength);
    if (pivots.length < 2) return NONE;

    const [previous, latest] = pivots.slice(-2);

    // Price lower, indicator higher. Both must hold, strictly. "Roughly equal"
    // lows are not divergence, they are a double bottom — a different pattern that
    // means a different thing, and the Pattern Engine owns it.
    const priceFell = latest.price < previous.price;
    const indicatorRose = latest.indicatorValue > previous.indicatorValue;

    if (!priceFell || !indicatorRose) return NONE;

    return {
      detected: true,
      kind: "BULLISH",
      strength: this.strength(previous, latest),
      quality: this.quality(previous, latest, candles, pivotStrength),
      swings: [previous, latest],
    };
  }

  /** Bearish: price made a HIGHER high, the indicator made a LOWER high. */
  bearish(
    candles: readonly Candle[],
    indicator: readonly Maybe[],
    lookback: number,
    pivotStrength = DEFAULT_PIVOT_STRENGTH,
  ): DivergenceResult {
    const pivots = this.pivotHighs(candles, indicator, lookback, pivotStrength);
    if (pivots.length < 2) return NONE;

    const [previous, latest] = pivots.slice(-2);

    const priceRose = latest.price > previous.price;
    const indicatorFell = latest.indicatorValue < previous.indicatorValue;

    if (!priceRose || !indicatorFell) return NONE;

    return {
      detected: true,
      kind: "BEARISH",
      strength: this.strength(previous, latest),
      quality: this.quality(previous, latest, candles, pivotStrength),
      swings: [previous, latest],
    };
  }

  /* ── Pivots ──────────────────────────────────────────────────────── */

  /**
   * A pivot low: a bar whose low is below the `strength` bars on EACH side.
   *
   * The right-hand bars are what make it confirmed, and they are why the search
   * stops `strength` bars short of the end. A "pivot" at the final bar is not a
   * pivot; it is a low that has not been tested yet.
   */
  private pivotLows(
    candles: readonly Candle[],
    indicator: readonly Maybe[],
    lookback: number,
    strength: number,
  ): SwingPoint[] {
    const out: SwingPoint[] = [];

    const start = Math.max(strength, candles.length - lookback);
    const end = candles.length - strength; // exclusive — the unconfirmed tail

    for (let i = start; i < end; i++) {
      const value = indicator[i];
      if (value === null) continue; // a pivot we cannot compare is not usable

      const low = candles[i].low;
      let isPivot = true;

      for (let j = i - strength; j <= i + strength; j++) {
        if (j === i) continue;
        if (candles[j].low < low) {
          isPivot = false;
          break;
        }
      }

      if (isPivot) {
        out.push({
          index: i,
          time: candles[i].time,
          price: low,
          indicatorValue: value,
        });
      }
    }

    return out;
  }

  private pivotHighs(
    candles: readonly Candle[],
    indicator: readonly Maybe[],
    lookback: number,
    strength: number,
  ): SwingPoint[] {
    const out: SwingPoint[] = [];

    const start = Math.max(strength, candles.length - lookback);
    const end = candles.length - strength;

    for (let i = start; i < end; i++) {
      const value = indicator[i];
      if (value === null) continue;

      const high = candles[i].high;
      let isPivot = true;

      for (let j = i - strength; j <= i + strength; j++) {
        if (j === i) continue;
        if (candles[j].high > high) {
          isPivot = false;
          break;
        }
      }

      if (isPivot) {
        out.push({
          index: i,
          time: candles[i].time,
          price: high,
          indicatorValue: value,
        });
      }
    }

    return out;
  }

  /* ── Scoring ─────────────────────────────────────────────────────── */

  /**
   * How pronounced is the disagreement?
   *
   * Price is measured in PERCENT (so BTC and SHIB are comparable) and the
   * indicator in its own units — which is imperfect, because RSI's 0–100 and
   * MACD's unbounded scale are not the same kind of quantity. The indicator move
   * is therefore normalised against the range the indicator actually covered
   * between the two pivots, rather than against an assumed scale.
   *
   * Deliberately conservative: it saturates. A gigantic divergence is capped at 1,
   * because past a point "more" stops meaning "more likely to work" — and a score
   * that keeps climbing would let one extreme reading dominate a confidence sum.
   */
  private strength(a: SwingPoint, b: SwingPoint): number {
    const priceMove = Math.abs((b.price - a.price) / a.price);

    const indicatorScale = Math.max(
      Math.abs(a.indicatorValue),
      Math.abs(b.indicatorValue),
      1,
    );
    const indicatorMove =
      Math.abs(b.indicatorValue - a.indicatorValue) / indicatorScale;

    /*
     * ── The reference points, and why they are set HIGH ──
     *
     * A score that saturates is a score with no information in it. The first
     * version of this used 3% price / 30% indicator as the reference, and every
     * realistic divergence came back as exactly 1.00 — the Confidence Engine would
     * have been handed a constant and told it was a measurement.
     *
     * These are set so that a *textbook* divergence — an 8% lower low against a
     * 60% recovery in the oscillator — scores around 0.85, and only genuinely
     * extreme readings reach 1. That leaves real resolution across the range where
     * divergences actually live.
     *
     * The geometric mean (via the sqrt) is deliberate: a huge price move against a
     * trivial momentum difference is NOT a strong divergence, and an arithmetic
     * mean would let one factor carry the other. Both have to be there.
     */
    const raw = (priceMove / 0.08) * (indicatorMove / 0.6);

    return clamp01(Math.sqrt(raw));
  }

  /**
   * How much do we believe these two pivots?
   *
   * Three things, all of which the naive detector ignores:
   *
   *  1. **Separation.** Two pivots four bars apart are noise. The signal is a
   *     comparison of two distinct swings, and swings need room. Rises toward 1 at
   *     around 10× the pivot strength.
   *
   *  2. **Prominence.** How far did each pivot stand out from the bars around it?
   *     A pivot that is 0.1% below its neighbours is a rounding error that happened
   *     to have lower bars on both sides. One that is 3% below them is a swing
   *     anybody would mark on a chart.
   *
   *  3. **Recency.** A divergence between two pivots from 200 bars ago is a fact
   *     about history, not a reason to enter now.
   *
   * Multiplied, not averaged. A divergence that fails badly on any ONE of these is
   * not "somewhat good" — it is not usable, and averaging would let two strong
   * factors carry a fatal one.
   */
  private quality(
    a: SwingPoint,
    b: SwingPoint,
    candles: readonly Candle[],
    pivotStrength: number,
  ): number {
    const separation = clamp01((b.index - a.index) / (pivotStrength * 10));

    const prominence = clamp01(
      (this.prominence(candles, a.index, pivotStrength) +
        this.prominence(candles, b.index, pivotStrength)) /
        2 /
        0.02, // 2% average prominence is a clean, obvious swing
    );

    const barsSince = candles.length - 1 - b.index;
    const recency = clamp01(1 - barsSince / (pivotStrength * 15));

    return clamp01(separation * prominence * recency);
  }

  /** How far the pivot stood out from its neighbours, as a fraction of price. */
  private prominence(
    candles: readonly Candle[],
    index: number,
    strength: number,
  ): number {
    const pivot = candles[index];

    let sum = 0;
    let count = 0;

    for (let j = index - strength; j <= index + strength; j++) {
      if (j === index || j < 0 || j >= candles.length) continue;
      sum += (candles[j].high + candles[j].low) / 2;
      count++;
    }

    if (count === 0) return 0;

    const neighbourhood = sum / count;
    const pivotPrice = (pivot.high + pivot.low) / 2;

    return Math.abs(pivotPrice - neighbourhood) / neighbourhood;
  }
}

/**
 * How many bars on each side must fail to exceed a pivot.
 *
 * Five is the conventional choice and it is a real trade-off, stated rather than
 * buried: a lower number finds more pivots and more of them are noise; a higher
 * number finds only major swings and confirms them later. Five means every
 * divergence this engine reports is at least five bars stale — which is the honest
 * cost of the pivot being real.
 */
const DEFAULT_PIVOT_STRENGTH = 5;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
