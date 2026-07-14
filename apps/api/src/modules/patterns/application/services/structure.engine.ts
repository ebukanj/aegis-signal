import { Injectable } from "@nestjs/common";
import type { Candle, MarketStructure, Timeframe } from "@aegis/contracts";
import type { Swing } from "../../domain/swing";

/**
 * STAGE 2 — Market Structure.
 *
 * **The highest-value thing this platform produces** (ADR-024), and the thing a
 * moving average cannot tell you.
 *
 * An EMA lags, and it lags hardest at exactly the moment a trend breaks. So a
 * strategy that checks "price above the 200 EMA" is checking whether the trend
 * *was* intact — and it will happily buy the first leg down. Higher highs and
 * higher lows is not a proxy for an uptrend. It **is** an uptrend, and it is the
 * definition traders actually use when they look at a chart.
 *
 * ── The two events, and why one of them is worth far more ──
 *
 * **Break of Structure (BOS)** — price takes out a swing point IN the direction of
 * the trend. An uptrend makes a new higher high. This is confirmation: the trend is
 * continuing. It is useful, and it is late — by the time you see it, the move has
 * started.
 *
 * **Change of Character (CHoCH)** — price takes out a swing point AGAINST the
 * trend, for the first time. An uptrend that has been making higher lows suddenly
 * takes out its last higher low. Nothing has been confirmed yet, and the trend may
 * well resume. But it is the **earliest structural evidence a trend is ending**,
 * and it arrives long before any moving average has begun to turn.
 *
 * Conflating the two is the classic error, and it is expensive in both directions:
 * treat a CHoCH as a BOS and you are buying a breakdown; ignore it and you are
 * holding through one.
 */
@Injectable()
export class StructureEngine {
  /**
   * The trend, as structure.
   *
   * Reads the last few swings and asks the only question that matters: are the
   * highs and lows both climbing, both falling, or neither?
   */
  analyse(input: {
    candles: readonly Candle[];
    swings: readonly Swing[];
    timeframe: Timeframe;
  }): MarketStructure {
    const { candles, swings, timeframe } = input;

    const highs = swings.filter((s) => s.kind === "HIGH");
    const lows = swings.filter((s) => s.kind === "LOW");

    const lastSwingHigh = highs.at(-1) ?? null;
    const lastSwingLow = lows.at(-1) ?? null;

    const trend = this.trend(highs, lows);
    const events = this.events(candles, swings, trend);

    return {
      timeframe,
      trend,
      swings: swings.map(toSwingPoint),
      lastSwingHigh: lastSwingHigh ? toSwingPoint(lastSwingHigh) : null,
      lastSwingLow: lastSwingLow ? toSwingPoint(lastSwingLow) : null,
      brokeStructure: events.brokeStructure,
      changedCharacter: events.changedCharacter,
    };
  }

  /**
   * UPTREND requires **both** higher highs and higher lows. Both.
   *
   * Higher highs alone is not an uptrend — it is a market making new highs while
   * also making lower lows, which is an expanding, violent range and one of the
   * most dangerous things to trade with a trend rule. Requiring both is what makes
   * this a structural definition rather than a momentum one.
   *
   * When the two disagree, the answer is **RANGING**, not "probably up". The
   * platform's whole posture is that it says nothing when there is nothing to say.
   */
  private trend(
    highs: readonly Swing[],
    lows: readonly Swing[],
  ): MarketStructure["trend"] {
    // Two of each, minimum. One high and one low tell you nothing about direction —
    // you cannot have a *higher* high without a previous high to be higher than.
    if (highs.length < 2 || lows.length < 2) return "UNCLEAR";

    const [previousHigh, latestHigh] = highs.slice(-2);
    const [previousLow, latestLow] = lows.slice(-2);

    const higherHigh = latestHigh.price > previousHigh.price;
    const higherLow = latestLow.price > previousLow.price;
    const lowerHigh = latestHigh.price < previousHigh.price;
    const lowerLow = latestLow.price < previousLow.price;

    if (higherHigh && higherLow) return "UPTREND";
    if (lowerHigh && lowerLow) return "DOWNTREND";

    /*
     * Highs and lows disagree — the market is compressing (lower highs AND higher
     * lows: a triangle), or expanding (higher highs AND lower lows: a broadening
     * mess). Both are RANGING as far as trend structure is concerned, and neither
     * is a direction to trade in.
     */
    return "RANGING";
  }

  /**
   * Did price break a swing, and which kind of break was it?
   *
   * ── A break is a CLOSE beyond the level, not a wick through it ──
   *
   * This single decision is the difference between a structure engine that works
   * and one that fires on every stop hunt.
   *
   * A wick through a swing low is exactly what a liquidity sweep looks like: price
   * dips below, takes the stops resting there, and snaps back. If a wick counted as
   * a break, the engine would report a change of character on the very bar the
   * market was *defending* the level — precisely inverting the meaning. Requiring a
   * close means the market has to actually accept the new price, and a sweep that
   * reverses within the bar is (correctly) reported by the LiquiditySweep detector
   * instead.
   *
   * The two detectors therefore agree on the same event and disagree about nothing.
   */
  private events(
    candles: readonly Candle[],
    swings: readonly Swing[],
    trend: MarketStructure["trend"],
  ): { brokeStructure: boolean; changedCharacter: boolean } {
    const lastCandle = candles.at(-1);
    if (!lastCandle) return { brokeStructure: false, changedCharacter: false };

    const highs = swings.filter((s) => s.kind === "HIGH");
    const lows = swings.filter((s) => s.kind === "LOW");

    const lastHigh = highs.at(-1);
    const lastLow = lows.at(-1);

    /*
     * The break must be RECENT.
     *
     * A swing that was taken out sixty bars ago is history, not an event. Reporting
     * it as `brokeStructure: true` on every bar since would make a strategy fire
     * repeatedly on one break — the same class of bug as treating `crosses_above`
     * as a state rather than an event.
     */
    const brokeAbove =
      lastHigh !== undefined &&
      lastCandle.close > lastHigh.price &&
      this.brokeRecently(candles, lastHigh.price, "ABOVE");

    const brokeBelow =
      lastLow !== undefined &&
      lastCandle.close < lastLow.price &&
      this.brokeRecently(candles, lastLow.price, "BELOW");

    switch (trend) {
      case "UPTREND":
        return {
          brokeStructure: brokeAbove, // a new higher high — continuation
          changedCharacter: brokeBelow, // the first lower low — the warning
        };

      case "DOWNTREND":
        return {
          brokeStructure: brokeBelow,
          changedCharacter: brokeAbove,
        };

      /*
       * In a range there is no trend to continue and none to break FROM, so a break
       * is neither. It is the range ending, and the RANGE detector owns that.
       *
       * Calling a range breakout a "break of structure" would let a trend-following
       * strategy fire on the first bar out of a range — before any trend structure
       * exists at all, which is the definition of chasing.
       */
      default:
        return { brokeStructure: false, changedCharacter: false };
    }
  }

  /** Did the break happen within the last few bars, or is it old news? */
  private brokeRecently(
    candles: readonly Candle[],
    level: number,
    direction: "ABOVE" | "BELOW",
    within = BREAK_RECENCY_BARS,
  ): boolean {
    const start = Math.max(0, candles.length - within);

    // Find the first bar in the window that closed beyond the level. If price was
    // ALREADY beyond it when the window opened, this is not a new break.
    const before = candles[start - 1];

    if (before) {
      const alreadyBeyond =
        direction === "ABOVE" ? before.close > level : before.close < level;

      if (alreadyBeyond) return false;
    }

    for (let i = start; i < candles.length; i++) {
      const beyond =
        direction === "ABOVE"
          ? candles[i].close > level
          : candles[i].close < level;

      if (beyond) return true;
    }

    return false;
  }

  /* ── Compression and expansion ───────────────────────────────────── */

  /**
   * Is structure tightening or widening?
   *
   * Compression — lower highs AND higher lows — is a market coiling. It is the
   * structural signature that precedes a breakout, and it is what makes a
   * squeeze tradeable rather than merely visible.
   *
   * Expansion — higher highs AND lower lows — is the opposite and is genuinely
   * dangerous: volatility is widening in both directions, so a stop sized for
   * yesterday's range is about to be noise.
   */
  compression(swings: readonly Swing[]): {
    state: "COMPRESSING" | "EXPANDING" | "STABLE";
    /** How much the swing range has narrowed (positive) or widened (negative). */
    ratio: number;
  } {
    const highs = swings.filter((s) => s.kind === "HIGH");
    const lows = swings.filter((s) => s.kind === "LOW");

    if (highs.length < 2 || lows.length < 2) {
      return { state: "STABLE", ratio: 0 };
    }

    const [previousHigh, latestHigh] = highs.slice(-2);
    const [previousLow, latestLow] = lows.slice(-2);

    const previousRange = previousHigh.price - previousLow.price;
    const latestRange = latestHigh.price - latestLow.price;

    if (previousRange <= 0) return { state: "STABLE", ratio: 0 };

    const ratio = 1 - latestRange / previousRange;

    if (ratio > COMPRESSION_THRESHOLD) return { state: "COMPRESSING", ratio };
    if (ratio < -COMPRESSION_THRESHOLD) return { state: "EXPANDING", ratio };

    return { state: "STABLE", ratio };
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

/**
 * A break counts as an event for this many bars.
 *
 * Long enough that a strategy evaluating one bar late still sees it; short enough
 * that it is an event rather than a permanent state. Three bars.
 */
export const BREAK_RECENCY_BARS = 3;

/** The swing range must change by 20% before it is compressing or expanding. */
export const COMPRESSION_THRESHOLD = 0.2;
