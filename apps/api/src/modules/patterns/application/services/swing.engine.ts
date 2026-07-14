import { Injectable } from "@nestjs/common";
import type { Candle } from "@aegis/contracts";
import { findPivots } from "../../../indicators/application/math/pivots";
import type { Swing, SwingCluster, SwingSequence } from "../../domain/swing";

/**
 * STAGE 1 — the Swing Engine.
 *
 * **Everything in this module depends on this being right.** Market structure,
 * break of structure, change of character, every wedge, every flag, every triangle,
 * every double top, every support zone — all of them are statements about swings.
 * A swing engine that is subtly wrong does not produce subtly wrong patterns; it
 * produces confident, well-formed, completely fictional ones.
 *
 * It is also the only expensive thing here, so it runs ONCE per timeframe and every
 * detector is handed the result. That is not merely an optimisation: a detector
 * that computed its own swings could disagree with the one next to it, and then
 * "bull flag confirmed by intact structure" would be confirming itself against a
 * market it had drawn differently.
 *
 * The pivot algorithm itself lives in `indicators/math/pivots.ts` — one
 * implementation, shared with the Divergence Engine, because two would drift.
 */
@Injectable()
export class SwingEngine {
  /**
   * Confirmed swings, enriched with age and prominence.
   *
   * `strength` is bars on each side. **The last `strength` bars can never contain a
   * swing**, by construction — a pivot needs bars after it that failed to exceed
   * it, and those bars do not exist yet. A swing engine that reports a swing at the
   * current bar is reporting one it cannot know about, which is look-ahead bias and
   * backtests beautifully.
   */
  detect(candles: readonly Candle[], strength = DEFAULT_STRENGTH): SwingSequence {
    const pivots = findPivots(candles, strength);
    const lastIndex = candles.length - 1;

    const all: Swing[] = pivots.map((pivot) => ({
      time: pivot.time,
      price: pivot.price,
      kind: pivot.kind,
      strength: pivot.strength,
      index: pivot.index,
      age: lastIndex - pivot.index,
      prominence: this.prominence(candles, pivot.index, pivot.kind, strength),
    }));

    return {
      all,
      highs: all.filter((s) => s.kind === "HIGH"),
      lows: all.filter((s) => s.kind === "LOW"),
    };
  }

  /**
   * How far the swing stood out from the bars around it, as a fraction of price.
   *
   * **This is what separates a swing from a wiggle**, and it is why the detectors
   * in this module do not find textbook geometry in random noise.
   *
   * Measured against the mean of the neighbourhood's midpoints rather than against
   * the extreme of it: comparing a high to the highest neighbouring high would make
   * prominence a function of one other bar, which is itself noise. The mean is what
   * "stood out from" actually means.
   *
   * As a FRACTION of price, never in price units — a $40 swing is enormous on SOL
   * and invisible on BTC, and a threshold in dollars would mean something different
   * on every instrument in the universe.
   */
  private prominence(
    candles: readonly Candle[],
    index: number,
    kind: "HIGH" | "LOW",
    strength: number,
  ): number {
    let sum = 0;
    let count = 0;

    for (let j = index - strength; j <= index + strength; j++) {
      if (j === index || j < 0 || j >= candles.length) continue;

      sum += (candles[j].high + candles[j].low) / 2;
      count++;
    }

    if (count === 0) return 0;

    const neighbourhood = sum / count;
    if (neighbourhood <= 0) return 0;

    const pivotPrice =
      kind === "HIGH" ? candles[index].high : candles[index].low;

    return Math.abs(pivotPrice - neighbourhood) / neighbourhood;
  }

  /* ── Clustering ──────────────────────────────────────────────────── */

  /**
   * Group swings that are at effectively the same price.
   *
   * Three highs within 0.3% of each other are not three rejections that happen to
   * be near each other — they are **one level, defended three times**. Without
   * clustering, the zone engine reports three weak levels where there is one strong
   * one, and a triple-top detector cannot tell a real triple top from three
   * unrelated highs that happen to be in the same neighbourhood.
   *
   * `tolerance` is a fraction of price, for the same reason prominence is: 0.3% is
   * 0.3% on BTC and on SHIB, and $50 is not.
   *
   * ── Why not k-means, or something cleverer ──
   *
   * Because a cluster here must be DETERMINISTIC and explainable. k-means depends
   * on its initialisation and can land differently on two runs over identical data,
   * which would make the platform's structure non-reproducible — and calibration
   * replays history (ADR-024). This is a single-linkage sweep over sorted prices:
   * one pass, no randomness, the same answer every time, and a human can check it
   * by eye.
   */
  cluster(
    swings: readonly Swing[],
    kind: "HIGH" | "LOW",
    tolerance = DEFAULT_CLUSTER_TOLERANCE,
  ): SwingCluster[] {
    const relevant = swings
      .filter((s) => s.kind === kind)
      .slice()
      .sort((a, b) => a.price - b.price);

    if (relevant.length === 0) return [];

    const clusters: SwingCluster[] = [];
    let current: Swing[] = [relevant[0]];

    for (let i = 1; i < relevant.length; i++) {
      const swing = relevant[i];
      const previous = current[current.length - 1];

      /*
       * Single linkage: a swing joins the cluster if it is close to the NEAREST
       * member, not to the cluster's mean.
       *
       * The trade-off is real and it is chosen deliberately. Linkage to the mean
       * would keep clusters tight; single linkage allows a chain — A near B, B near
       * C, so A, B and C are one cluster even if A and C are further apart than the
       * tolerance. That is the correct behaviour for a price LEVEL, which is a band
       * that gets defended across a range and not a point. A ceiling that has been
       * hit at 62,300, 62,380 and 62,450 is one ceiling.
       */
      if (Math.abs(swing.price - previous.price) / previous.price <= tolerance) {
        current.push(swing);
        continue;
      }

      clusters.push(this.toCluster(current, kind));
      current = [swing];
    }

    clusters.push(this.toCluster(current, kind));

    return clusters;
  }

  private toCluster(members: Swing[], kind: "HIGH" | "LOW"): SwingCluster {
    const prices = members.map((m) => m.price);

    return {
      kind,
      low: Math.min(...prices),
      high: Math.max(...prices),
      center: prices.reduce((sum, p) => sum + p, 0) / prices.length,
      members: members.slice().sort((a, b) => a.index - b.index),
      lastIndex: Math.max(...members.map((m) => m.index)),
    };
  }

  /* ── Queries the detectors need ──────────────────────────────────── */

  /** The most recent swing of a kind, or null. */
  latest(swings: readonly Swing[], kind: "HIGH" | "LOW"): Swing | null {
    for (let i = swings.length - 1; i >= 0; i--) {
      if (swings[i].kind === kind) return swings[i];
    }
    return null;
  }

  /**
   * Are two swings the same price, within tolerance?
   *
   * The definition of "equal highs", and therefore of a double top. Relative, not
   * absolute — see `cluster`.
   */
  equal(a: Swing, b: Swing, tolerance = DEFAULT_EQUALITY_TOLERANCE): boolean {
    return Math.abs(a.price - b.price) / Math.max(a.price, b.price) <= tolerance;
  }
}

/**
 * Five bars on each side.
 *
 * A real trade-off, stated rather than buried. Lower finds more swings and more of
 * them are noise; higher finds only major structure and confirms it later. Five
 * means **every swing this engine reports is at least five bars stale** — which is
 * the honest cost of it being a swing at all, and not a guess about the bar we are
 * standing on.
 */
export const DEFAULT_STRENGTH = 5;

/** Swings within 0.3% of each other are one level. */
export const DEFAULT_CLUSTER_TOLERANCE = 0.003;

/** Two swings within 0.15% are "equal" — the double-top / equal-highs threshold. */
export const DEFAULT_EQUALITY_TOLERANCE = 0.0015;

/**
 * Below this, a "swing" is a rounding error that happened to have lower bars on
 * both sides. Detectors that build geometry out of pivots this shallow are the
 * ones that find flags in a flat market.
 */
export const MINIMUM_PROMINENCE = 0.004;
