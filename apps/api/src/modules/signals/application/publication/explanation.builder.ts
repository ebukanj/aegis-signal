import type { ConfluenceReport } from "@aegis/contracts";
import type { SignalCandidate } from "../../domain/intake";
import type { SignalPolicy } from "../../signal.policy";

/**
 * Why this signal is worth a trader's attention — in words, with the numbers in
 * them.
 *
 * ── The Signal Engine adds nothing to the explanation; it ASSEMBLES it ──
 *
 * The Strategy Evaluator already explained why the setup exists. The Risk Engine
 * already explained why it is acceptable, and what it could not check. The
 * Confidence Engine already explained what a score like this has been worth, and
 * where it might not. This builder stitches those explanations into one, adds the
 * confluence and the publication verdict, and hands a trader a single account they
 * can argue with — because a signal a trader cannot interrogate is a signal they
 * should not act on (Founding Principle 3).
 *
 * The `contradicting` list is the one that matters. Any system can list why it was
 * right; publishing why it might be wrong, at the moment of decision, is the thing
 * that separates intelligence from a sales pitch.
 */
export function buildExplanation(input: {
  primary: SignalCandidate;
  confluence: ConfluenceReport;
  isPrime: boolean;
  primeReason: string;
  policy: SignalPolicy;
}): {
  whyPublished: string;
  supporting: string[];
  contradicting: string[];
  unassessed: string[];
} {
  const { primary, confluence, isPrime } = input;
  const report = primary.confidence;
  const conf = report.confidence;

  const supporting: string[] = [];
  const contradicting: string[] = [];

  /* ── Confluence — the dimensions of agreement ──────────────────── */

  for (const c of confluence.contributors) {
    if (c.weight === 0 && c.name !== "Strategy confluence") continue;
    if (c.agrees > 0.15) {
      supporting.push(`${c.name}: ${c.measured}`);
    } else if (c.agrees < -0.15) {
      contradicting.push(`${c.name}: ${c.measured}`);
    }
  }

  if (confluence.agreeingStrategies.length > 1) {
    supporting.push(
      `${confluence.agreeingStrategies.length} independent strategies agree: ${confluence.agreeingStrategies.join(", ")}`,
    );
  }

  /* ── Confidence — carry the report's own supporting/contradicting ── */

  supporting.push(...report.supporting);
  contradicting.push(...report.contradicting);

  /* ── The unassessed travel through untouched ───────────────────── */

  const unassessed = [...report.unassessed];

  /*
   * The Risk Engine's own blind spots, if it named any, belong here too — a
   * published signal must carry every "nobody checked this" all the way to the
   * trader, exactly as the Risk and Confidence engines insisted upstream.
   */
  if (primary.risk.assessment?.unassessed?.length) {
    unassessed.push(...primary.risk.assessment.unassessed);
  }

  /* ── The one-line verdict ──────────────────────────────────────── */

  const rate =
    conf.displayedWinRate === null
      ? "and nobody yet knows what a score like this is worth — it has never been graded against a live outcome"
      : `and scores in this band have historically been worth ${conf.displayedWinRate.toFixed(0)}% (${conf.basis.toLowerCase()})`;

  const agreement =
    confluence.agreeingStrategies.length > 1
      ? `${confluence.agreeingStrategies.length} strategies agree and the evidence lines up (confluence ${confluence.score})`
      : `the evidence lines up (confluence ${confluence.score})`;

  const whyPublished = isPrime
    ? `PRIME. Score ${conf.score} clears the Prime floor, ${rate}; ${agreement}. This is one of the day's few — the platform is interrupting you on purpose.`
    : `Published. Score ${conf.score} clears the publication floor, ${rate}; ${agreement}. Not Prime: ${dePrime(input.primeReason)}.`;

  return {
    whyPublished,
    supporting: dedupe(supporting),
    contradicting: dedupe(contradicting),
    unassessed: dedupe(unassessed),
  };
}

/** Trim the machine-facing preamble off the Prime reason for the trader-facing line. */
function dePrime(reason: string): string {
  return reason.replace(/^not Prime-eligible — /, "").slice(0, 160);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
