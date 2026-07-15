/**
 * Beta-Binomial shrinkage — the arithmetic that stops three lucky setups from
 * becoming a 100% win rate.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PROBLEM, STATED PLAINLY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A new strategy fires three times and wins all three.
 *
 *   Naive win rate:  3/3 = 100%
 *
 * Every trading platform in the world has shipped this number at some point, and
 * it is a lie of the most seductive kind: it is *arithmetically correct*. Three
 * divided by three really is one. The lie is not in the division — it is in
 * presenting it as though it were knowledge.
 *
 * Three coin flips landing heads is not evidence of a two-headed coin. It happens
 * one time in eight with a perfectly fair one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIX
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Start from what we already believe (the prior — the base rate across every
 * setup we have ever labelled), and let evidence move us off it in proportion to
 * how much evidence there actually is:
 *
 *              wins + k·prior
 *   posterior = ──────────────
 *              samples + k
 *
 * where k is the prior's strength in pseudo-observations. At k = 20 and a global
 * base rate of 40%:
 *
 *   3 wins from 3      → (3 + 8) / (3 + 20)     = 48%   ← not 100%
 *   30 wins from 50    → (30 + 8) / (50 + 20)   = 54%
 *   300 wins from 500  → (300 + 8) / (500 + 20) = 59%   ← converging on the truth
 *
 * The estimate is DRAGGED toward the prior when evidence is thin and released as
 * evidence accumulates. That is not conservatism for its own sake — it is the
 * correct answer under Bayes' rule, and the platform's own honesty depends on it.
 *
 * No machine learning. No black box. Two additions and a division, and a user can
 * check the arithmetic on the back of an envelope.
 */

export interface Posterior {
  /** What we actually believe, after shrinkage. */
  readonly mean: number;
  /** The raw count. Honest, and dangerous on its own. */
  readonly observed: number | null;
  readonly samples: number;
  readonly wins: number;
  /** How far shrinkage moved us. Large = the evidence was thin. */
  readonly shrinkage: number;
  /** 90% credible interval. Wide = we do not know. */
  readonly low: number;
  readonly high: number;
}

/**
 * Shrink an observed win rate toward a prior.
 *
 * @param wins    successes observed
 * @param samples trials observed (wins + losses + expiries — EVERYTHING, because
 *                dropping the setups that went nowhere is how a win rate gets
 *                manufactured)
 * @param prior   what we believed before we looked
 * @param strength the prior's weight in pseudo-observations
 */
export function shrink(
  wins: number,
  samples: number,
  prior: number,
  strength: number,
): Posterior {
  if (samples < 0 || wins < 0 || wins > samples) {
    throw new Error(
      `A posterior needs coherent counts: ${wins} wins from ${samples} samples is not a thing that can have happened`,
    );
  }

  /* The Beta posterior's parameters. */
  const alpha = wins + strength * prior;
  const beta = samples - wins + strength * (1 - prior);

  const mean = alpha / (alpha + beta);
  const observed = samples > 0 ? wins / samples : null;

  return {
    mean,
    observed,
    samples,
    wins,
    shrinkage: observed === null ? 1 : Math.abs(mean - observed),
    ...credibleInterval(alpha, beta),
  };
}

/**
 * A 90% credible interval, by normal approximation to the Beta.
 *
 * ── Why the interval is not decoration ──
 *
 * "Won 60% of 5 setups" and "won 60% of 500 setups" are the same number and
 * completely different claims. The first has an interval so wide it contains
 * "loses money"; the second does not. A platform that shows the point estimate
 * and hides the interval has hidden the only part that says whether to believe
 * it.
 *
 * The normal approximation is used rather than the exact Beta quantile because it
 * is a handful of arithmetic with no special functions, it is accurate to well
 * within a percentage point at the sample sizes that matter here, and — the part
 * that counts — it can be checked by hand. An engine nobody can audit is an engine
 * nobody should trust, and that includes this one.
 */
function credibleInterval(alpha: number, beta: number): { low: number; high: number } {
  const n = alpha + beta;
  const mean = alpha / n;
  const variance = (alpha * beta) / (n * n * (n + 1));
  const sd = Math.sqrt(variance);

  /* 1.645 σ ≈ 90%. */
  return {
    low: Math.max(0, mean - 1.645 * sd),
    high: Math.min(1, mean + 1.645 * sd),
  };
}

/**
 * Blend the historical prior with the live ledger, per ADR-024.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   "The blend is a Beta prior with shrinkage: start on history, and each live
 *    outcome pulls the number toward reality. After roughly 30 live signals for
 *    a score bucket, live dominates and history is dropped."
 *
 * The one rule that makes this honest, and it is absolute:
 *
 *   **HISTORICAL AND LIVE ARE NEVER SILENTLY MERGED INTO ONE NUMBER.**
 *
 * The blend is displayed, but both components travel with it, and the basis says
 * which is doing the work. A platform that quietly folded a backtest into its
 * live track record — and then called the result "our win rate" — would be
 * committing the single most consequential fraud available to it, because a
 * backtest can be re-run until it looks good and a live result cannot.
 *
 * Note the asymmetry in how the two are treated: history is the PRIOR, and live
 * is the EVIDENCE. Evidence overrides a prior; a prior never overrides evidence.
 * That ordering is the whole point.
 */
export function blend(
  historical: { wins: number; samples: number } | null,
  live: { wins: number; samples: number },
  globalBaseRate: number,
  strength: number,
  liveDominanceSamples: number,
): {
  basis: "UNCALIBRATED" | "HISTORICAL" | "BLENDED" | "LIVE";
  rate: number | null;
  posterior: Posterior | null;
} {
  /* Enough of our own settled signals: history is DROPPED, not diluted. */
  if (live.samples >= liveDominanceSamples) {
    const posterior = shrink(live.wins, live.samples, globalBaseRate, strength);
    return { basis: "LIVE", rate: posterior.mean, posterior };
  }

  if (live.samples > 0 && historical !== null && historical.samples > 0) {
    /*
     * History becomes the prior; live outcomes are the observations that move us
     * off it. As live accumulates, the prior's grip weakens — which is exactly
     * what "pulls the number toward reality" means, expressed as arithmetic.
     */
    const historicalRate = historical.wins / historical.samples;
    const posterior = shrink(live.wins, live.samples, historicalRate, strength);
    return { basis: "BLENDED", rate: posterior.mean, posterior };
  }

  if (live.samples > 0) {
    const posterior = shrink(live.wins, live.samples, globalBaseRate, strength);
    return { basis: "LIVE", rate: posterior.mean, posterior };
  }

  if (historical !== null && historical.samples > 0) {
    const posterior = shrink(
      historical.wins,
      historical.samples,
      globalBaseRate,
      strength,
    );
    return { basis: "HISTORICAL", rate: posterior.mean, posterior };
  }

  /*
   * Nothing. No history, no live outcomes.
   *
   * We do NOT return the global base rate here, and the temptation to is worth
   * naming: it would produce a plausible-looking number for a bucket about which
   * we know precisely nothing. The contract makes this unrepresentable anyway —
   * an UNCALIBRATED basis must carry a null rate — but the refusal belongs here
   * too, where the arithmetic is, and not only in the schema that catches it.
   */
  return { basis: "UNCALIBRATED", rate: null, posterior: null };
}
