import type {
  CalibratedConfidence,
  CalibrationModel,
  ConfidenceContributor,
  LabelledSetup,
} from "@aegis/contracts";
import type { ConfidencePolicy } from "../../confidence.policy";
import type { ScoringContext } from "../../domain/scoring";

/**
 * Turns the arithmetic into sentences a human can argue with.
 *
 * Founding Principle 3: *a signal without an explanation is not intelligence.*
 * That principle is usually satisfied with a list of reasons the platform was
 * RIGHT, which is not an explanation — it is a sales pitch with bullet points.
 *
 * ── The contradicting list is the one that matters ──
 *
 * Any system can produce a list of things that support its own conclusion. It
 * takes a deliberate decision to publish the things that argue against it, and to
 * put them in front of the user at the moment they are deciding whether to risk
 * money.
 *
 * So a confidence report ALWAYS carries three lists:
 *
 *   supporting    — why the evidence is good
 *   contradicting — why it might not be           ← the one nobody else ships
 *   unassessed    — what nobody could check       ← the one that keeps us honest
 *
 * A report with an empty `contradicting` list on a middling score is a bug, not a
 * clean trade.
 */
export function explain(input: {
  score: number;
  contributors: readonly ConfidenceContributor[];
  confidence: CalibratedConfidence;
  similar: { matches: LabelledSetup[]; winRate: number | null; tier: string };
  model: CalibrationModel | null;
  publishable: boolean;
  primeEligible: boolean;
  proven: boolean;
  policy: ConfidencePolicy;
  context: ScoringContext;
}): {
  supporting: string[];
  contradicting: string[];
  unassessed: string[];
  verdict: string;
} {
  const { score, contributors, confidence, similar, model, publishable, proven, policy } =
    input;

  const supporting: string[] = [];
  const contradicting: string[] = [];
  const unassessed: string[] = [];

  /* ── The contributors speak for themselves ─────────────────────── */

  for (const c of contributors) {
    if (c.name === "Base") continue;

    if (c.weight > 0) {
      supporting.push(`${c.name}: ${c.measured} (+${c.weight})`);
    } else if (c.weight < 0) {
      contradicting.push(`${c.name}: ${c.measured} (${c.weight})`);
    } else if (c.source === "MEASURED" && c.note.length > 0) {
      /*
       * A zero-weight contributor is neither for nor against, and it must not be
       * silently dropped — "we looked at the structure and it was neutral" is a
       * fact a trader wants, and its absence would read as "we did not look".
       */
      supporting.push(`${c.name}: ${c.measured}`);
    }
  }

  /* ── History ───────────────────────────────────────────────────── */

  if (similar.winRate !== null) {
    const line =
      `${similar.matches.length} comparable historical setups (${similar.tier}) ` +
      `went on to hit their first target ${(similar.winRate * 100).toFixed(0)}% of the time`;

    if (similar.winRate >= 0.5) supporting.push(line);
    else contradicting.push(line);
  } else {
    unassessed.push(
      similar.matches.length === 0
        ? "nothing in the replayed history resembles this setup — the platform has never seen this kind of trade before, and has no idea what it is worth"
        : `only ${similar.matches.length} comparable setups exist — too few to claim a win rate, so none is claimed`,
    );
  }

  /* ── The calibration itself ────────────────────────────────────── */

  if (!model) {
    unassessed.push(
      "no calibration model exists yet — this score has never been checked against an outcome, so it is a measure of EVIDENCE and not a probability of winning",
    );
  } else if (confidence.displayedWinRate === null) {
    unassessed.push(
      `calibration v${model.version} has fewer than ${policy.minimumSamplesForCalibration} outcomes in this score bucket — the model exists but knows nothing about a score of ${score}, and it will not guess`,
    );
  } else {
    const rate = confidence.displayedWinRate.toFixed(0);

    if (confidence.basis === "HISTORICAL") {
      supporting.push(
        `scores in this band hit their first target ${rate}% of the time across ${confidence.historicalSamples} REPLAYED setups (calibration v${model.version}, out-of-sample error ${(model.outOfSample.ece * 100).toFixed(1)}%)`,
      );
      unassessed.push(
        "that rate comes from replayed history, not from our own published signals — the rules were written by people who had already seen this history, so it is optimistic by construction (ADR-024)",
      );
    } else if (confidence.basis === "BLENDED") {
      supporting.push(
        `${rate}% — blending ${confidence.historicalSamples} replayed setups with ${confidence.liveSamples} of our own settled signals, with the live results doing more of the work as they accumulate`,
      );
    } else if (confidence.basis === "LIVE") {
      supporting.push(
        `${rate}% across ${confidence.liveSamples} of OUR OWN settled signals — replayed history is no longer used for this score`,
      );
    }
  }

  /* ── The live ledger ───────────────────────────────────────────── */

  if (confidence.liveSamples === 0) {
    unassessed.push(
      "this platform has never published a signal and settled it — there is no live track record at all, and the only thing that truly earns trust is the one thing that does not exist yet",
    );
  }

  /* ── The verdict ───────────────────────────────────────────────── */

  const verdict = buildVerdict({
    score,
    confidence,
    publishable,
    proven,
    policy,
    primeEligible: input.primeEligible,
  });

  return { supporting, contradicting, unassessed, verdict };
}

function buildVerdict(input: {
  score: number;
  confidence: CalibratedConfidence;
  publishable: boolean;
  primeEligible: boolean;
  proven: boolean;
  policy: ConfidencePolicy;
}): string {
  const { score, confidence, publishable, primeEligible, proven, policy } = input;

  const meaning =
    confidence.displayedWinRate === null
      ? "and nobody yet knows what a score of that size is worth, because it has never been checked against an outcome"
      : `and scores in this band have historically been worth ${confidence.displayedWinRate.toFixed(0)}% (${confidence.basis.toLowerCase()}, ${confidence.historicalSamples + confidence.liveSamples} outcomes)`;

  if (!publishable) {
    return `Score ${score}, below the publication floor of ${policy.publishAt} — ${meaning}. Not published. A day with no signals is a successful day if the evidence produced none.`;
  }

  if (primeEligible) {
    return `Score ${score}, clearing both the publication floor (${policy.publishAt}) and the Prime floor (${policy.primeAt}) — ${meaning}.`;
  }

  if (score >= policy.primeAt && !proven) {
    /*
     * The interesting case, and the one worth writing carefully.
     *
     * A score above the Prime floor, refused Prime anyway — because the strategy
     * that produced it has never had a signal published and settled. ADR-023 §4:
     * UNPROVEN strategies are barred from Prime, and a backtest does not prove a
     * strategy. If it did, Prime would mean nothing, and Prime is the one place
     * this platform stakes its reputation.
     */
    return `Score ${score} clears the Prime floor of ${policy.primeAt}, ${meaning} — but Prime is REFUSED: this strategy has never had a signal published and settled, and a replay is not a track record (ADR-023 §4). It is published as an ordinary signal.`;
  }

  return `Score ${score}, clearing the publication floor of ${policy.publishAt} — ${meaning}.`;
}
