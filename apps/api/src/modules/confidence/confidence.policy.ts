import type { ConfidenceBucket } from "@aegis/contracts";

/**
 * Every number the Confidence Engine is allowed to believe.
 *
 * Same discipline as `risk.policy.ts`, and for the same reason: a threshold
 * buried inside an `if` is a threshold nobody can audit. When the platform says
 * a signal scored 71 and was not published, a trader is entitled to see the
 * floor it was measured against.
 *
 * But there is a second reason here that does not apply to risk, and it is
 * sharper.
 *
 * ── The weights below are the platform's OPINION, and they must be falsifiable ──
 *
 * Nothing in this file is a measurement. "Volume confirmation is worth 8 points"
 * is a guess — a considered one, but a guess. The entire apparatus downstream
 * (the replay, the reliability curve, the ECE) exists to find out whether these
 * guesses produce a score that means anything.
 *
 * That is why they live in one place, versioned: when the reliability curve says
 * the scorer is lying, THIS is the file you change, and the calibration model
 * version records which set of guesses produced which numbers.
 */

export interface ConfidencePolicy {
  /* ── The score ─────────────────────────────────────────────────── */

  /**
   * The starting point when there is no history at all.
   *
   * 50 is not a claim that the trade is a coin flip. **The score is not a
   * probability** and must never be read as one — 50 is the middle of the range
   * the contributors move within, nothing more. The moment a replay exists, this
   * is replaced by the strategy's measured win rate in this regime.
   */
  readonly neutralBase: number;

  /** Points each contributor may move the score. See the note above: these are guesses. */
  readonly weights: {
    readonly trendAlignment: number;
    readonly momentum: number;
    readonly volumeConfirmation: number;
    readonly patternQuality: number;
    readonly structure: number;
    readonly volatility: number;
    readonly riskQuality: number;
    readonly regimeFit: number;
    /**
     * ZERO. Deliberately, and permanently until it is measured.
     *
     * The old code paid +4 points for every extra strategy that agreed, invented
     * from nothing. ADR-024 §6 is explicit: the uplift is derived from the
     * ledger, and *until there is data, the uplift is zero and the signal states
     * "2 strategies agree — uplift not yet calibrated."*
     *
     * The contributor still APPEARS in the breakdown, carrying 0 points and
     * saying why. A confluence we cannot price is not a confluence we get to
     * charge for.
     */
    readonly confluence: number;
  };

  /* ── Bayes ─────────────────────────────────────────────────────── */

  /**
   * The strength of the Beta prior, in pseudo-observations.
   *
   * This is the number that stops three lucky setups becoming a 100% win rate.
   * At `priorStrength = 20`, a strategy with 3 wins from 3 lands at
   * (3 + 20·p) / (3 + 20) — barely moved off the global base rate, which is the
   * correct amount of belief to place in three coin flips.
   *
   * Higher = more sceptical, slower to trust. Lower = quicker to believe a small
   * sample, which is the failure this entire engine exists to prevent.
   */
  readonly priorStrength: number;

  /**
   * Live outcomes needed before history is dropped entirely (ADR-024: "after
   * roughly 30 live signals for a score bucket, live dominates and history is
   * dropped").
   */
  readonly liveDominanceSamples: number;

  /** Below this, a bucket has nothing to say and the basis stays UNCALIBRATED. */
  readonly minimumSamplesForCalibration: number;

  /* ── Buckets and thresholds ────────────────────────────────────── */

  /** Score buckets for the reliability curve. 5 points wide. */
  readonly bucketWidth: number;

  /** Lower edge of each named tier. These are LABELS, not probabilities. */
  readonly tiers: ReadonlyArray<{ floor: number; bucket: ConfidenceBucket }>;

  /**
   * Thresholds — applied to the SCORE, which is real evidence from day one.
   *
   * They are NOT applied to the calibrated win rate, and the distinction is
   * load-bearing: until a replay exists every win rate is null, so gating on it
   * would mean the platform emits nothing at all. Gating on the evidence and
   * *labelling* what that evidence has historically been worth is the honest
   * arrangement — the trader sees "score 91, and scores like this have won 61%
   * of the time", never "91% likely to win".
   */
  readonly publishAt: number;
  readonly primeAt: number;
  readonly exceptionalAt: number;

  /* ── The replay ────────────────────────────────────────────────── */

  /** Fraction of the corpus (oldest-first) used to FIT. The rest grades it. */
  readonly calibrationSplit: number;

  /** Bars a setup may remain unresolved before it is EXPIRED. */
  readonly maximumBarsHeld: number;

  /** Rolling window for the volume/volatility baselines used to bucket evidence. */
  readonly bucketBaselineBars: number;
}

export const DEFAULT_CONFIDENCE_POLICY: ConfidencePolicy = {
  neutralBase: 50,

  weights: {
    trendAlignment: 8,
    momentum: 7,
    volumeConfirmation: 8,
    patternQuality: 10,
    structure: 8,
    volatility: 6,
    riskQuality: 8,
    regimeFit: 9,
    confluence: 0,
  },

  priorStrength: 20,
  liveDominanceSamples: 30,
  minimumSamplesForCalibration: 20,

  bucketWidth: 5,

  tiers: [
    { floor: 95, bucket: "EXCEPTIONAL" },
    { floor: 90, bucket: "VERY_HIGH" },
    { floor: 80, bucket: "HIGH" },
    { floor: 70, bucket: "MODERATE" },
    { floor: 60, bucket: "LOW" },
    { floor: 0, bucket: "DO_NOT_PUBLISH" },
  ],

  publishAt: 85,
  primeAt: 92,
  exceptionalAt: 96,

  calibrationSplit: 0.7,
  maximumBarsHeld: 72,
  bucketBaselineBars: 100,
};

/**
 * A policy that contradicts itself would reject every signal, silently, for a
 * reason nobody could ever find — and every individual rejection would look
 * perfectly reasonable. Refused at boot, exactly as the Risk Engine's is.
 */
export function assertConfidencePolicyCoherent(policy: ConfidencePolicy): void {
  const fail = (why: string): never => {
    throw new Error(`Incoherent confidence policy: ${why}`);
  };

  if (policy.publishAt >= policy.primeAt) {
    fail(
      `publishAt (${policy.publishAt}) must sit below primeAt (${policy.primeAt}) — Prime is a subset of published, not an exception to it`,
    );
  }

  if (policy.primeAt >= policy.exceptionalAt) {
    fail(
      `primeAt (${policy.primeAt}) must sit below exceptionalAt (${policy.exceptionalAt})`,
    );
  }

  if (policy.priorStrength <= 0) {
    fail(
      "priorStrength must be positive — a prior of zero means three lucky setups become a 100% win rate, which is the exact failure this engine exists to prevent",
    );
  }

  if (policy.calibrationSplit <= 0 || policy.calibrationSplit >= 1) {
    fail(
      `calibrationSplit (${policy.calibrationSplit}) must leave data on BOTH sides — a model with no validation half cannot be graded, and a model that cannot be graded cannot be trusted`,
    );
  }

  if (policy.weights.confluence !== 0) {
    fail(
      `confluence weight is ${policy.weights.confluence}, and it must be 0 until the uplift is MEASURED from the ledger (ADR-024 §6). A confluence we cannot price is not a confluence we get to charge for.`,
    );
  }

  /*
   * The contributors must be able to reach the publication threshold from the
   * neutral base, or nothing will ever publish on day one and the platform will
   * look broken rather than honest.
   */
  const upside = Object.values(policy.weights).reduce((sum, w) => sum + w, 0);

  if (policy.neutralBase + upside < policy.publishAt) {
    fail(
      `a perfect setup scores ${policy.neutralBase + upside} from the neutral base, which cannot reach the publication floor of ${policy.publishAt} — the platform would be silent for reasons of arithmetic rather than reasons of evidence`,
    );
  }

  const tiers = [...policy.tiers];
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].floor >= tiers[i - 1].floor) {
      fail("tiers must descend — a bucket cannot start above the one above it");
    }
  }
}
