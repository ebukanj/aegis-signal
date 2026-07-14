import { Injectable } from "@nestjs/common";
import type { Candle, Timeframe, Zone } from "@aegis/contracts";
import type { Swing } from "../../domain/swing";
import { SwingEngine, DEFAULT_CLUSTER_TOLERANCE } from "./swing.engine";

/**
 * STAGE 3 — Zones. Standing structure, not events.
 *
 * A pattern *happens*. A zone *is*: a band of price that has been defended, with a
 * width, an age, and a history of being retested.
 *
 * ── A zone is a BAND, never a line ──
 *
 * "Resistance at 62,400" is a fiction that feels precise. Price rejected from
 * 62,380 once and 62,450 another time, and real orders sit across that entire band.
 * A single line produces a stop placed one tick beyond a level that was never that
 * precise — and it gets taken out by noise the real zone would have absorbed.
 *
 * The width is not sloppiness to be tidied away. It is the measurement.
 */
@Injectable()
export class ZoneEngine {
  constructor(private readonly swingEngine: SwingEngine) {}

  detect(input: {
    candles: readonly Candle[];
    swings: readonly Swing[];
    timeframe: Timeframe;
  }): Zone[] {
    const { candles, swings, timeframe } = input;

    return [
      ...this.horizontal(candles, swings, timeframe),
      ...this.orderBlocks(candles, timeframe),
      ...this.liquidityPools(candles, swings, timeframe),
    ];
  }

  /* ── Support and resistance ──────────────────────────────────────── */

  /**
   * Levels price has actually defended.
   *
   * Built from CLUSTERED swings, not individual ones. Three highs within 0.3% of
   * each other are not three weak ceilings — they are one strong one, defended
   * three times, and a zone engine that misses that reports the market as flimsier
   * than it is.
   */
  private horizontal(
    candles: readonly Candle[],
    swings: readonly Swing[],
    timeframe: Timeframe,
  ): Zone[] {
    const zones: Zone[] = [];
    const lastPrice = candles.at(-1)?.close ?? 0;

    for (const kind of ["HIGH", "LOW"] as const) {
      const clusters = this.swingEngine.cluster(
        swings,
        kind,
        DEFAULT_CLUSTER_TOLERANCE,
      );

      for (const cluster of clusters) {
        // One touch is not a level. It is a price the market visited once, and
        // every price in history has been visited once.
        if (cluster.members.length < MINIMUM_TOUCHES) continue;

        const { retests, lastTouchedAt, broken } = this.history(
          candles,
          cluster.low,
          cluster.high,
          cluster.lastIndex,
          kind === "HIGH" ? "RESISTANCE" : "SUPPORT",
        );

        zones.push({
          /*
           * A broken resistance is not deleted — it is RE-LABELLED.
           *
           * Once price closes decisively above a ceiling, that ceiling routinely
           * becomes a floor: the traders who sold there are now wrong, and they
           * buy it back on the retest. A zone engine that deletes broken levels
           * cannot see the single most reliable retest in trading.
           */
          kind: broken
            ? kind === "HIGH"
              ? "SUPPORT"
              : "RESISTANCE"
            : kind === "HIGH"
              ? "RESISTANCE"
              : "SUPPORT",
          timeframe,
          low: cluster.low,
          high: cluster.high,
          createdAt: cluster.members[0].time,
          lastTouchedAt,
          retests,
          strength: this.strength(cluster.members.length, retests, cluster, lastPrice),
          swings: cluster.members.map(toSwingPoint),
          broken,
        });
      }
    }

    return zones;
  }

  /**
   * How much has this zone actually proven itself?
   *
   * ── More retests is NOT linearly better, and treating it as such is the classic
   *    error ──
   *
   * A level tested twice and holding is strong: the market came back, and buyers
   * were still there. A level tested SEVEN times is a level being **worn down** —
   * each test consumes the resting orders that made it a level in the first place,
   * and a level that has been hit seven times is usually about to break. Traders
   * know this instinctively ("the more times a level is tested, the weaker it
   * gets") and a naive `strength = retests / 10` gets it exactly backwards.
   *
   * So the curve peaks around 3 touches and DECAYS after it.
   */
  private strength(
    touches: number,
    retests: number,
    cluster: { low: number; high: number },
    lastPrice: number,
  ): number {
    const total = touches + retests;

    // Peaks at 3, decays after. A hyperbola, not a line.
    const testScore = total <= 3 ? total / 3 : 3 / total;

    /*
     * A TIGHT zone is a stronger zone.
     *
     * Three rejections spread over a 4% band is not one level — it is a
     * neighbourhood where selling tends to happen, and a stop placed against it has
     * to be wide enough to be useless. Three rejections inside 0.3% is a wall.
     */
    const width = cluster.high - cluster.low;
    const relativeWidth = lastPrice > 0 ? width / lastPrice : 1;
    const tightness = Math.max(0, 1 - relativeWidth / 0.02);

    return clamp01(testScore * 0.65 + tightness * 0.35);
  }

  /** Walk forward from the zone and count what price did when it came back. */
  private history(
    candles: readonly Candle[],
    low: number,
    high: number,
    fromIndex: number,
    role: "SUPPORT" | "RESISTANCE",
  ): { retests: number; lastTouchedAt: number | null; broken: boolean } {
    let retests = 0;
    let lastTouchedAt: number | null = null;
    let broken = false;

    let inside = false;

    for (let i = fromIndex + 1; i < candles.length; i++) {
      const candle = candles[i];

      const touched = candle.low <= high && candle.high >= low;

      if (touched) {
        lastTouchedAt = candle.time;

        // Count one retest per VISIT, not per bar. Price that sits inside a zone
        // for six bars has tested it once, and counting six would make a level look
        // six times more proven than it is.
        if (!inside) {
          retests++;
          inside = true;
        }
      } else {
        inside = false;
      }

      /*
       * BROKEN requires a CLOSE beyond the band, not a wick.
       *
       * A wick through a support zone is a liquidity sweep — the market taking the
       * stops resting below and immediately reclaiming. Counting it as a break
       * would delete a level on the exact bar it was most powerfully defended.
       */
      const closedBeyond =
        role === "SUPPORT" ? candle.close < low : candle.close > high;

      if (closedBeyond) broken = true;
    }

    return { retests, lastTouchedAt, broken };
  }

  /* ── Order blocks (supply / demand) ──────────────────────────────── */

  /**
   * The candle that CAUSED the move.
   *
   * An order block is the last opposing candle before an impulsive run — the last
   * down-candle before price rockets up. The logic is not mystical: institutions
   * cannot fill a large buy order at one price without moving the market, so they
   * accumulate into the selling, and the last down-candle is where that unfilled
   * size still sits. When price returns there, the remainder of the order is
   * waiting.
   *
   * Objective, and that is why it is in the vocabulary while head & shoulders is
   * not: "the last down-candle before a move of at least N ATR" is a measurement.
   * Nobody has to draw anything.
   */
  private orderBlocks(candles: readonly Candle[], timeframe: Timeframe): Zone[] {
    const zones: Zone[] = [];

    const ranges = candles.map((c) => c.high - c.low);
    const averageRange =
      ranges.reduce((sum, r) => sum + r, 0) / Math.max(1, ranges.length);

    if (averageRange <= 0) return zones;

    for (let i = 1; i < candles.length - IMPULSE_BARS; i++) {
      const candle = candles[i];

      const isDown = candle.close < candle.open;
      const isUp = candle.close > candle.open;
      if (!isDown && !isUp) continue;

      // What happened immediately after?
      const after = candles.slice(i + 1, i + 1 + IMPULSE_BARS);
      const move = after[after.length - 1].close - candle.close;
      const impulse = Math.abs(move) / averageRange;

      // Not an impulse — just the market drifting. An "order block" before a
      // 0.3-ATR wander is a candle, not a level, and reporting it would carpet the
      // chart with zones.
      if (impulse < IMPULSE_STRENGTH) continue;

      // A DEMAND block is the last DOWN candle before an UP move, and vice versa.
      // The direction has to oppose the impulse, or it is not absorbing anything.
      const demand = isDown && move > 0;
      const supply = isUp && move < 0;
      if (!demand && !supply) continue;

      const { retests, lastTouchedAt, broken } = this.history(
        candles,
        candle.low,
        candle.high,
        i,
        demand ? "SUPPORT" : "RESISTANCE",
      );

      zones.push({
        kind: demand ? "DEMAND_BLOCK" : "SUPPLY_BLOCK",
        timeframe,
        low: candle.low,
        high: candle.high,
        createdAt: candle.time,
        lastTouchedAt,
        retests,
        // An untested order block is at its STRONGEST — the resting size is still
        // there. Each retest consumes it. This is the inverse of a support level,
        // and it is why they are scored differently.
        strength: clamp01(
          Math.min(1, impulse / (IMPULSE_STRENGTH * 2)) * (retests === 0 ? 1 : 1 / (1 + retests)),
        ),
        swings: [],
        broken,
      });
    }

    return zones;
  }

  /* ── Liquidity pools ─────────────────────────────────────────────── */

  /**
   * Where the stops are.
   *
   * Under equal lows and above equal highs sit clusters of stop orders. This is not
   * a level price *respects* — it is a level price is **drawn to**, because those
   * resting stops are the liquidity a large order needs in order to fill at all.
   *
   * Getting this backwards is the single most expensive mistake in retail trading:
   * placing a stop just under an obvious double bottom, which is exactly where the
   * market is most likely to reach before reversing. The Reversal strategy trades
   * the sweep of these pools, not the "support" they appear to be.
   */
  private liquidityPools(
    candles: readonly Candle[],
    swings: readonly Swing[],
    timeframe: Timeframe,
  ): Zone[] {
    const zones: Zone[] = [];
    const lastPrice = candles.at(-1)?.close ?? 0;

    for (const kind of ["HIGH", "LOW"] as const) {
      const clusters = this.swingEngine.cluster(swings, kind, EQUAL_TOLERANCE);

      for (const cluster of clusters) {
        // Equal highs/lows need at least two. One swing is not a pool.
        if (cluster.members.length < 2) continue;

        const { retests, lastTouchedAt, broken } = this.history(
          candles,
          cluster.low,
          cluster.high,
          cluster.lastIndex,
          kind === "HIGH" ? "RESISTANCE" : "SUPPORT",
        );

        zones.push({
          kind: "LIQUIDITY_POOL",
          timeframe,
          low: cluster.low,
          high: cluster.high,
          createdAt: cluster.members[0].time,
          lastTouchedAt,
          retests,
          /*
           * The MORE equal and the MORE numerous, the stronger the pool — the exact
           * opposite of a support level's decay curve. Three highs at precisely the
           * same price is a bigger, more obvious pile of stops than two, and more
           * traders can see it, which is what makes it a target.
           */
          strength: clamp01(
            (cluster.members.length / 4) *
              (1 - (cluster.high - cluster.low) / Math.max(lastPrice * EQUAL_TOLERANCE, 1e-9)),
          ),
          swings: cluster.members.map(toSwingPoint),
          broken,
        });
      }
    }

    return zones;
  }
}

function toSwingPoint(swing: Swing) {
  return {
    time: swing.time,
    price: swing.price,
    kind: swing.kind,
    strength: swing.strength,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** One touch is not a level. Every price in history has been visited once. */
const MINIMUM_TOUCHES = 2;

/** Bars after the candle in which the impulse must happen. */
const IMPULSE_BARS = 3;

/** The move must be this many average-ranges to count as impulsive. */
const IMPULSE_STRENGTH = 2;

/** Swings within 0.15% are "equal" — the liquidity-pool threshold. */
const EQUAL_TOLERANCE = 0.0015;
