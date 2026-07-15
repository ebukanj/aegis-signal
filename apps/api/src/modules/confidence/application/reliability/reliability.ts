import type { ReliabilityBin, ReliabilityMetrics } from "@aegis/contracts";

/**
 * How wrong is the platform, and where?
 *
 * This is the module that grades every other module in this milestone. It is
 * deliberately unsympathetic: there is no metric here that a bad model can score
 * well on, and no averaging that lets a good bucket hide a catastrophic one.
 *
 * ── The reliability curve IS the platform's integrity, on display ──
 *
 * "When we say 90, we are right 87% of the time." If that sentence is true, the
 * number 90 means something and a trader can act on it. If the curve bows below
 * the diagonal, the scorer is overconfident — it is talking people into trades
 * with a number it has not earned — and it must be retuned. ADR-024 puts this
 * chart on the Track Record page precisely so the lie cannot hide.
 */

export interface Prediction {
  /** What we said, 0–1. */
  readonly predicted: number;
  /** What happened. 1 = win. */
  readonly outcome: 0 | 1;
  /** The raw score, for bucketing. */
  readonly score: number;
}

/**
 * Compute the curve and the four metrics.
 *
 * **Feed this the VALIDATION split.** Feeding it the data the model was fitted on
 * measures how well the model memorised, which is not a question anybody asked.
 */
export function reliability(
  predictions: readonly Prediction[],
  bucketWidth: number,
): ReliabilityMetrics {
  if (predictions.length === 0) {
    return {
      brier: 0,
      logLoss: 0,
      ece: 0,
      mce: 0,
      samples: 0,
      baseRate: 0,
      curve: [],
    };
  }

  const n = predictions.length;
  const wins = predictions.filter((p) => p.outcome === 1).length;
  const baseRate = wins / n;

  /* ── Brier: mean squared error of the probabilities ─────────────── */
  const brier =
    predictions.reduce((sum, p) => sum + (p.predicted - p.outcome) ** 2, 0) / n;

  /*
   * ── Log loss: punishes CONFIDENT wrongness savagely ──────────────
   *
   * An assured 99% that loses costs ln(1/0.01) ≈ 4.6 nats, against 0.69 for an
   * honest 50%. It is the metric that catches exactly the failure this platform
   * exists to avoid — not being wrong, but being *sure* and wrong.
   *
   * Clamped away from 0 and 1 because ln(0) is infinite, and one infinitely
   * confident mistake would make the average meaningless rather than merely
   * terrible.
   */
  const EPS = 1e-15;
  const logLoss =
    predictions.reduce((sum, p) => {
      const q = Math.min(1 - EPS, Math.max(EPS, p.predicted));
      return sum - (p.outcome === 1 ? Math.log(q) : Math.log(1 - q));
    }, 0) / n;

  /* ── The curve ──────────────────────────────────────────────────── */
  const bins = new Map<number, Prediction[]>();

  for (const p of predictions) {
    const bucket = Math.floor(p.score / bucketWidth) * bucketWidth;
    const existing = bins.get(bucket);
    if (existing) existing.push(p);
    else bins.set(bucket, [p]);
  }

  const curve: ReliabilityBin[] = [...bins.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, members]) => {
      const binWins = members.filter((p) => p.outcome === 1).length;
      return {
        bucket,
        predicted: members.reduce((s, p) => s + p.predicted, 0) / members.length,
        observed: binWins / members.length,
        samples: members.length,
        wins: binWins,
      };
    });

  /*
   * ── ECE: the average gap, weighted by how often we said it ───────
   *
   * This is the number a trader actually feels. A model that is 20 points off in
   * a bucket it almost never uses is barely lying; one that is 5 points off in
   * the bucket it uses constantly is lying all day.
   */
  const ece = curve.reduce(
    (sum, bin) => sum + (bin.samples / n) * Math.abs(bin.predicted - bin.observed),
    0,
  );

  /*
   * ── MCE: the WORST bucket, unweighted ───────────────────────────
   *
   * And this is why ECE alone is not enough. A model can have a beautiful ECE and
   * still be catastrophically wrong in the one bucket where it is most confident
   * — because that bucket is rare, and the weighting buries it under the buckets
   * that are common and easy.
   *
   * The rare, confident bucket is the one people bet the most money on.
   */
  const mce = curve.reduce(
    (worst, bin) => Math.max(worst, Math.abs(bin.predicted - bin.observed)),
    0,
  );

  return { brier, logLoss, ece, mce, samples: n, baseRate, curve };
}

/**
 * The score a model must beat to have earned its existence.
 *
 * Predicting the base rate at everything — "every setup wins 41% of the time,
 * regardless" — is the null model. It is perfectly calibrated *on average* and
 * completely useless, because it never distinguishes anything from anything.
 *
 * A calibrator whose Brier score is no better than this has added nothing but
 * complexity, and shipping it would be shipping a machine that exists to look
 * sophisticated. This function is what lets a test say so out loud.
 */
export function baselineBrier(predictions: readonly Prediction[]): number {
  if (predictions.length === 0) return 0;

  const baseRate =
    predictions.filter((p) => p.outcome === 1).length / predictions.length;

  return (
    predictions.reduce((sum, p) => sum + (baseRate - p.outcome) ** 2, 0) /
    predictions.length
  );
}
