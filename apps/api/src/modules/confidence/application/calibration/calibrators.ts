import type { CalibrationMethod, ReliabilityBin } from "@aegis/contracts";
import { shrink } from "../bayesian/beta";
import type { Prediction } from "../reliability/reliability";

/**
 * The three ways a score becomes a probability.
 *
 * All three are fitted from the same labelled setups. The one that ships is the
 * one with the best OUT-OF-SAMPLE calibration error — not the one anybody
 * preferred, and not the one that scored best on the data it was fitted on.
 *
 * ── Why three, when one would do ──
 *
 * Because I do not know which is right, and neither does anybody else until the
 * corpus exists. Each of the three fails in a different, characteristic way, and
 * the failures are informative:
 *
 *   - If ISOTONIC wins by a mile, the score→outcome relationship is strange and
 *     non-linear, and the scorer's weights probably need rethinking.
 *   - If PLATT wins, the relationship is a clean sigmoid and all is well.
 *   - If SHRINKAGE wins, the corpus is too small for anything cleverer, and the
 *     honest thing is to say so rather than to fit a curve to noise.
 *
 * The architecture exists so the method can be replaced without touching a single
 * caller. That was a requirement, and it is also just correct: a platform whose
 * calibration method is welded into its pipeline is a platform that can never
 * admit the method was wrong.
 */

export interface Calibrator {
  readonly method: CalibrationMethod;
  /** score (0–100) → probability (0–1). Must be deterministic. */
  apply(score: number): number;
  /** Platt's two parameters, for the model record. Null for the others. */
  readonly params: { a: number | null; b: number | null };
  readonly bins: readonly ReliabilityBin[];
}

/* ── SHRINKAGE — the default ────────────────────────────────────────── */

/**
 * Beta-Binomial shrinkage, per score bucket, backed off to the global base rate.
 *
 * The default, and the only one of the three that degrades GRACEFULLY. A bucket
 * with two observations returns something very close to the global base rate and
 * a wide interval — which is precisely the right answer, because two observations
 * tell you almost nothing.
 *
 * The others, handed two observations, will happily fit them.
 */
export function fitShrinkage(
  predictions: readonly Prediction[],
  bucketWidth: number,
  priorStrength: number,
): Calibrator {
  const globalBaseRate =
    predictions.length > 0
      ? predictions.filter((p) => p.outcome === 1).length / predictions.length
      : 0.5;

  const buckets = new Map<number, { wins: number; samples: number }>();

  for (const p of predictions) {
    const key = Math.floor(p.score / bucketWidth) * bucketWidth;
    const b = buckets.get(key) ?? { wins: 0, samples: 0 };
    b.wins += p.outcome;
    b.samples += 1;
    buckets.set(key, b);
  }

  const table = new Map<number, number>();
  const bins: ReliabilityBin[] = [];

  for (const [bucket, { wins, samples }] of [...buckets.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    const posterior = shrink(wins, samples, globalBaseRate, priorStrength);
    table.set(bucket, posterior.mean);
    bins.push({
      bucket,
      predicted: posterior.mean,
      observed: wins / samples,
      samples,
      wins,
    });
  }

  return {
    method: "SHRINKAGE",
    params: { a: null, b: null },
    bins,
    apply(score) {
      const key = Math.floor(score / bucketWidth) * bucketWidth;
      /*
       * A bucket nobody has ever landed in returns the global base rate — not a
       * neighbouring bucket's value, and not an interpolation. Interpolating
       * across an empty bucket invents evidence for a score that has never once
       * been observed.
       */
      return table.get(key) ?? globalBaseRate;
    },
  };
}

/* ── PLATT — logistic, fitted by IRLS ───────────────────────────────── */

/**
 * Platt scaling: p = σ(a·score + b), fitted by Newton-Raphson / IRLS.
 *
 * Two parameters for the entire corpus, which is its strength and its weakness in
 * the same breath. It borrows strength across every bucket, so a sparse bucket
 * inherits a sensible answer from its neighbours rather than fitting three coin
 * flips.
 *
 * What it CANNOT do is represent a non-monotone scorer. If a score of 70
 * genuinely wins more often than a score of 85, Platt will smooth straight over
 * it and report a tidy increasing curve.
 *
 * That is not a defect to be worked around. **If the scorer is non-monotone we
 * want to KNOW** — it means the contributor weights are wrong, and smoothing it
 * away would hide the one fact that could have fixed them. Which is why isotonic
 * is also fitted, and why the two are compared rather than one being chosen in
 * advance.
 */
export function fitPlatt(predictions: readonly Prediction[]): Calibrator {
  /* Scores are 0–100; centred and scaled so the optimiser is well-conditioned. */
  const x = predictions.map((p) => (p.score - 50) / 25);
  const y = predictions.map((p) => p.outcome);

  let a = 0;
  let b = 0;

  const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

  /*
   * IRLS. Twenty iterations is comfortably past convergence for a
   * two-parameter logistic; it either converged long ago or the data is
   * degenerate, and in the degenerate case more iterations only produce larger
   * numbers, not better ones.
   */
  for (let iteration = 0; iteration < 20; iteration += 1) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;

    for (let i = 0; i < x.length; i += 1) {
      const p = sigmoid(a * x[i] + b);
      const r = p - y[i];
      /* Floor the weight: a saturated p makes w vanish and the Hessian singular. */
      const w = Math.max(p * (1 - p), 1e-10);

      g0 += r * x[i];
      g1 += r;
      h00 += w * x[i] * x[i];
      h01 += w * x[i];
      h11 += w;
    }

    /*
     * Ridge regularisation.
     *
     * Without it, a perfectly separable corpus — every setup above score 80 won,
     * every setup below lost — drives `a` toward infinity and the model starts
     * emitting probabilities of exactly 0 and 1. A model that says "certain" is a
     * model that has stopped being a probability, and the one thing this platform
     * may never do is claim certainty.
     */
    const RIDGE = 1e-6;
    h00 += RIDGE;
    h11 += RIDGE;

    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;

    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;

    a -= da;
    b -= db;

    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) break;
  }

  return {
    method: "PLATT",
    params: { a, b },
    bins: [],
    apply(score) {
      return sigmoid(a * ((score - 50) / 25) + b);
    },
  };
}

/* ── ISOTONIC — pool-adjacent-violators ─────────────────────────────── */

/**
 * Isotonic regression: the best-fitting NON-DECREASING step function, found
 * exactly by the pool-adjacent-violators algorithm.
 *
 * The most flexible of the three. It can fit any monotone relationship without
 * assuming a shape — and that is exactly its defect, which is worth being blunt
 * about because isotonic regression is the calibrator most likely to be chosen
 * for the wrong reason:
 *
 * **With few samples it fits the noise perfectly.** Handed a bucket containing
 * three setups that happened to win, it will report that bucket wins 100% of the
 * time. It is not confused; it is doing precisely what it was asked to do. The
 * error is in the asking.
 *
 * It is shipped, benchmarked, and EXPECTED TO LOSE on a small corpus. There is a
 * test that proves it produces exactly this pathology — asserting the failure,
 * rather than trusting a comment about it — so that if someone later switches the
 * default to isotonic because it scored beautifully in-sample, the test says why
 * that was a mistake.
 */
export function fitIsotonic(
  predictions: readonly Prediction[],
  bucketWidth: number,
): Calibrator {
  const buckets = new Map<number, { wins: number; samples: number }>();

  for (const p of predictions) {
    const key = Math.floor(p.score / bucketWidth) * bucketWidth;
    const b = buckets.get(key) ?? { wins: 0, samples: 0 };
    b.wins += p.outcome;
    b.samples += 1;
    buckets.set(key, b);
  }

  /* PAVA operates on the buckets in ascending score order. */
  const blocks = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, { wins, samples }]) => ({
      buckets: [bucket],
      wins,
      samples,
      value: wins / samples,
    }));

  /*
   * Pool adjacent violators: while any block's value is below its predecessor's,
   * merge the two and recompute. The result is the closest non-decreasing fit in
   * a least-squares sense, and it is exact — no iteration count, no tolerance, no
   * learning rate.
   */
  let merged = true;
  while (merged) {
    merged = false;

    for (let i = 1; i < blocks.length; i += 1) {
      if (blocks[i].value < blocks[i - 1].value) {
        const a = blocks[i - 1];
        const b = blocks[i];

        const pooled = {
          buckets: [...a.buckets, ...b.buckets],
          wins: a.wins + b.wins,
          samples: a.samples + b.samples,
          value: (a.wins + b.wins) / (a.samples + b.samples),
        };

        blocks.splice(i - 1, 2, pooled);
        merged = true;
        break;
      }
    }
  }

  const table = new Map<number, number>();
  const bins: ReliabilityBin[] = [];

  for (const block of blocks) {
    for (const bucket of block.buckets) {
      table.set(bucket, block.value);
      const raw = buckets.get(bucket)!;
      bins.push({
        bucket,
        predicted: block.value,
        observed: raw.wins / raw.samples,
        samples: raw.samples,
        wins: raw.wins,
      });
    }
  }

  bins.sort((a, b) => a.bucket - b.bucket);

  const globalBaseRate =
    predictions.length > 0
      ? predictions.filter((p) => p.outcome === 1).length / predictions.length
      : 0.5;

  const known = [...table.keys()].sort((a, b) => a - b);

  return {
    method: "ISOTONIC",
    params: { a: null, b: null },
    bins,
    apply(score) {
      const key = Math.floor(score / bucketWidth) * bucketWidth;
      const exact = table.get(key);
      if (exact !== undefined) return exact;

      if (known.length === 0) return globalBaseRate;

      /*
       * Unseen bucket: clamp to the nearest END of the fitted range rather than
       * interpolating into a gap. A score above everything observed inherits the
       * top block's rate; below, the bottom's. It is the most defensible thing
       * available, and it is still an extrapolation — which is why the report
       * carries the sample count that says how much to trust it.
       */
      if (key < known[0]) return table.get(known[0])!;
      if (key > known[known.length - 1]) return table.get(known[known.length - 1])!;

      const below = known.filter((k) => k < key).pop()!;
      return table.get(below)!;
    },
  };
}
