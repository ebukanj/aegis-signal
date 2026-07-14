import { Injectable } from "@nestjs/common";
import type { Candle } from "@aegis/contracts";
import type { Swing } from "../../domain/swing";
import { MINIMUM_PROMINENCE } from "./swing.engine";

/**
 * The Quality Engine.
 *
 * Every detector must be able to **argue against itself**. That is the whole idea
 * here, and it is why `weaknesses` is a required field rather than a nicety.
 *
 * A pattern engine that returns `BULL_FLAG: true, quality: 0.87` is demanding
 * trust. The number is unfalsifiable — a trader cannot agree or disagree with 0.87,
 * they can only accept it. But *"the pole ran 6.2% in 4 bars, the pullback retraced
 * 38% on falling volume, and the trendlines fit at R²=0.91 — however, the breakout
 * came on below-average volume"* is a claim a human can push back on.
 *
 * The platform's entire promise is that a trader can see WHY (PRODUCT_BIBLE). This
 * is where a pattern keeps that promise, and it is what the Confidence Engine will
 * later have to justify itself against.
 *
 * ── Factors MULTIPLY, they do not average ──
 *
 * The most important design decision in this file. A bull flag with a textbook pole,
 * textbook trendlines, and **swings so shallow they are indistinguishable from
 * noise** is not a "mostly good" flag. It is not a flag. Averaging would score it
 * 0.7 and ship it; multiplying scores it near zero, which is the truth.
 *
 * Averaging lets two strong factors carry a fatal one. In a system whose output is
 * a trade, that is not a rounding difference — it is the difference between a
 * pattern and a Rorschach test.
 */
@Injectable()
export class QualityEngine {
  /**
   * Assemble the verdict.
   *
   * `factors` are named, 0–1, and each carries the sentence that explains it. The
   * evidence and the weaknesses are generated from the SAME factors that produced
   * the score — so the explanation cannot drift away from the number, which is how
   * "explainable AI" usually ends up lying.
   */
  score(factors: QualityFactor[]): QualityVerdict {
    if (factors.length === 0) {
      return { quality: 0, evidence: [], weaknesses: ["nothing was measured"] };
    }

    /*
     * The geometric mean, not the arithmetic one.
     *
     * A plain product punishes exponentially — five factors of 0.8 would score
     * 0.33, which reads as "bad" when every single component was good. The
     * geometric mean keeps the multiplicative property (one zero factor kills the
     * score, which is the point) while staying on a scale a human can read: five
     * 0.8s score 0.8.
     */
    const product = factors.reduce((acc, f) => acc * clamp01(f.value), 1);
    const quality = Math.pow(product, 1 / factors.length);

    const evidence = factors
      .filter((f) => f.value >= STRONG)
      .map((f) => f.evidence);

    const weaknesses = factors
      .filter((f) => f.value < WEAK)
      .map((f) => f.weakness ?? `${f.name} is weak (${f.value.toFixed(2)})`);

    return { quality: clamp01(quality), evidence, weaknesses };
  }

  /* ── The factors detectors reuse ─────────────────────────────────── */

  /**
   * Are the swings this pattern is built on actually swings?
   *
   * **The factor that stops every detector in this module from finding textbook
   * geometry in a flat market.** A "double top" between two pivots that are 0.05%
   * above their neighbours is two rounding errors that happened to have lower bars
   * on either side. The geometry is immaculate. The pattern is imaginary.
   */
  swingProminence(swings: readonly Swing[]): QualityFactor {
    if (swings.length === 0) {
      return {
        name: "swing prominence",
        value: 0,
        evidence: "",
        weakness: "the pattern has no swings behind it at all",
      };
    }

    const mean =
      swings.reduce((sum, s) => sum + s.prominence, 0) / swings.length;

    // MINIMUM_PROMINENCE (0.4%) scores ~0.5; 1.5% and above is a swing nobody would
    // argue with.
    const value = clamp01(mean / (MINIMUM_PROMINENCE * 3.75));

    return {
      name: "swing prominence",
      value,
      evidence: `the swings stand out ${(mean * 100).toFixed(2)}% from surrounding price`,
      weakness:
        `the swings are only ${(mean * 100).toFixed(2)}% from surrounding price — ` +
        `barely distinguishable from noise`,
    };
  }

  /**
   * Did volume agree?
   *
   * A breakout on below-average volume is where false breakouts live: price pushed
   * through a level that nobody was defending and nobody was buying, and it comes
   * straight back. Volume is not decoration on a pattern — for a breakout it is
   * most of the evidence.
   *
   * Returns `null` for `confirmed` when we genuinely cannot tell, which is not the
   * same as "no".
   */
  volumeExpansion(
    relativeVolume: readonly (number | null)[],
    atIndex: number,
  ): QualityFactor & { confirmed: boolean | null } {
    const relative = relativeVolume[atIndex];

    if (relative === null || relative === undefined) {
      return {
        name: "volume",
        value: NEUTRAL,
        evidence: "",
        weakness: "volume could not be assessed",
        confirmed: null,
      };
    }

    const confirmed = relative >= VOLUME_EXPANSION;

    return {
      name: "volume",
      // Not 0 when volume is quiet — a flag can be perfectly valid on average
      // volume, it is simply less convincing. Zero would kill the whole detection
      // via the geometric mean, and that would be an overreaction.
      value: clamp01(0.35 + Math.min(relative, 2.5) / 3.5),
      evidence: `volume was ${relative.toFixed(1)}× its recent average`,
      weakness: `volume was only ${relative.toFixed(1)}× average — the move has little behind it`,
      confirmed,
    };
  }

  /** Volume DRYING UP is the confirmation, for consolidations. The inverse. */
  volumeContraction(
    relativeVolume: readonly (number | null)[],
    fromIndex: number,
    toIndex: number,
  ): QualityFactor & { confirmed: boolean | null } {
    const window = relativeVolume
      .slice(fromIndex, toIndex + 1)
      .filter((v): v is number => v !== null);

    if (window.length === 0) {
      return {
        name: "volume contraction",
        value: NEUTRAL,
        evidence: "",
        weakness: "volume could not be assessed",
        confirmed: null,
      };
    }

    const mean = window.reduce((sum, v) => sum + v, 0) / window.length;

    /*
     * A flag's consolidation SHOULD be quiet.
     *
     * Rising volume during the pullback of a bull flag means the sellers are
     * committed — that is not a pause in an uptrend, it is a reversal in progress,
     * and it is the difference between a flag and a top. A detector that ignores
     * this reports the two identically.
     */
    const confirmed = mean <= VOLUME_CONTRACTION;

    return {
      name: "volume contraction",
      value: clamp01(1.4 - mean),
      evidence: `volume dried up to ${mean.toFixed(1)}× average during the consolidation — sellers are not committed`,
      weakness: `volume stayed at ${mean.toFixed(1)}× average during the consolidation — the sellers are committed, and this may be a reversal rather than a pause`,
      confirmed,
    };
  }

  /** How well the swings actually lie on the trendline. Any two points make a line. */
  trendlineFit(rSquared: number, label: string): QualityFactor {
    return {
      name: `${label} fit`,
      value: clamp01(rSquared),
      evidence: `the ${label} fits its touches at R²=${rSquared.toFixed(2)}`,
      weakness: `the ${label} fits at only R²=${rSquared.toFixed(2)} — the touches do not really lie on it`,
    };
  }

  /**
   * Did price actually RESPECT the line, or just cross it repeatedly?
   *
   * The check naive detectors leave out, and the one that kills the most false
   * positives. Three swing highs sitting on a line is a coincidence if price closed
   * above that line four times in between.
   */
  respect(touches: number, violations: number, label: string): QualityFactor {
    const total = touches + violations;

    if (total === 0) {
      return {
        name: `${label} respect`,
        value: 0,
        evidence: "",
        weakness: `price never interacted with the ${label} — it is a line, not a level`,
      };
    }

    const value = clamp01(touches / total);

    return {
      name: `${label} respect`,
      value,
      evidence: `price respected the ${label} ${touches} time(s) and broke it ${violations}`,
      weakness: `price broke the ${label} ${violations} time(s) — it is not really holding`,
    };
  }

  /**
   * A pattern that has been forming forever is not a pattern.
   *
   * A "bull flag" whose consolidation has run for 60 bars is not consolidating —
   * it is a range, and the pole that preceded it is ancient history. There is a
   * window in which the setup means something, and outside it the geometry is a
   * coincidence.
   */
  duration(bars: number, ideal: number, maximum: number): QualityFactor {
    const value =
      bars > maximum ? 0 : clamp01(1 - Math.abs(bars - ideal) / maximum);

    return {
      name: "duration",
      value,
      evidence: `it formed over ${bars} bars`,
      weakness:
        bars > maximum
          ? `it has been forming for ${bars} bars — that is a range, not a pattern`
          : `its ${bars}-bar duration is unusual for this pattern`,
    };
  }

  /**
   * How SIGNIFICANT is this, which is not how CLEAN.
   *
   * A textbook flag on a dead 15m chart is high quality and low strength. The two
   * must not be conflated: quality asks "is this really a flag?", strength asks "is
   * this flag worth anything?" A detector that returns only one of them lets a
   * beautiful, meaningless pattern reach a trader with a high score.
   */
  significance(input: {
    candles: readonly Candle[];
    fromIndex: number;
    toIndex: number;
    /** The move the pattern implies, as a fraction of price. */
    impliedMove: number;
  }): number {
    const { candles, impliedMove } = input;

    const lastPrice = candles.at(-1)?.close ?? 0;
    if (lastPrice <= 0) return 0;

    /*
     * Measured against the instrument's OWN volatility, not against a fixed
     * percentage. A 2% implied move is enormous on BTC and nothing on a memecoin
     * that routinely does 15% in an afternoon. A fixed threshold would rank every
     * altcoin above every major, permanently.
     */
    const ranges = candles
      .slice(-30)
      .map((c) => (c.high - c.low) / Math.max(c.close, 1e-9));

    const typicalRange =
      ranges.reduce((sum, r) => sum + r, 0) / Math.max(1, ranges.length);

    if (typicalRange <= 0) return 0;

    return clamp01(impliedMove / (typicalRange * 6));
  }
}

export interface QualityFactor {
  name: string;
  /** 0–1. */
  value: number;
  /** Shown when the factor is strong. Plain English, in a trader's words. */
  evidence: string;
  /** Shown when it is weak. Required in spirit: every factor can fail. */
  weakness?: string;
}

export interface QualityVerdict {
  quality: number;
  evidence: string[];
  weaknesses: string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Above this, a factor is worth reporting as evidence. */
const STRONG = 0.65;

/** Below this, it is worth reporting as a weakness. */
const WEAK = 0.5;

/** What an unmeasurable factor scores — neither credit nor blame. */
const NEUTRAL = 0.5;

/** Volume this many times its average counts as expansion. */
const VOLUME_EXPANSION = 1.3;

/** Volume below this fraction of average counts as contraction. */
const VOLUME_CONTRACTION = 0.85;
