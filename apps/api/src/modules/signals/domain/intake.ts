import type {
  CandidateSignal,
  ConfidenceReport,
  MarketContext,
  RiskDecision,
} from "@aegis/contracts";

/**
 * Everything the Signal Engine needs to decide whether to publish — and NOTHING
 * it would need to recompute.
 *
 * ── The Signal Engine consumes evidence. It never creates it. ──
 *
 * This is the whole architectural point of the milestone. Each field below was
 * produced by an engine that OWNS it: the candidate by the Strategy Evaluator, the
 * decision by the Risk Engine, the confidence by the Confidence Engine, the market
 * context by the Regime Engine. The Signal Engine reads them, weighs them against
 * each other, and selects. It does not re-derive a single one — if it did, there
 * would be two sources of truth for the same number, and the moment there are two
 * they drift (AGENTS.md §2).
 */
export interface SignalCandidate {
  readonly candidate: CandidateSignal;

  /**
   * The Risk Engine's verdict. MUST be approved — an unapproved candidate never
   * reaches this engine, and one that arrives unapproved is a pipeline bug, not a
   * market rejection.
   */
  readonly risk: RiskDecision;

  /** The Confidence Engine's report: the score, the calibration, the breakdown. */
  readonly confidence: ConfidenceReport;

  /** The market at the moment the candidate fired — for the confluence measure. */
  readonly market: MarketContext;

  /** When the candidate arrived. Injected, so replay does not depend on the clock. */
  readonly now: number;
}

/**
 * What is wrong with an incomplete intake, if anything.
 *
 * ── Incompleteness here is a BUG, not a rejection ──
 *
 * A trade suppressed for a thin spread is the machine working. A candidate that
 * arrives with no confidence report is the machine BROKEN — some upstream stage
 * failed to run, or ran and dropped its output. The two must never be reported the
 * same way: one is a quiet market, the other is a silent defect, and a platform
 * that files them together will one day go dark and call it a calm day.
 *
 * So intake validation throws with `INVALID_CANDIDATE`, loudly, rather than
 * returning a tidy suppression. It should be impossible to reach in production;
 * the check exists so that if it ever is reached, it announces itself.
 */
export function assertComplete(intake: SignalCandidate): void {
  const problems: string[] = [];

  if (!intake.risk.approved) {
    problems.push(
      "the Risk Engine did NOT approve this candidate — an unapproved trade must never reach the publisher",
    );
  }

  if (!intake.risk.assessment) {
    problems.push("the risk decision carries no assessment");
  }

  if (intake.confidence.candidateId !== intake.candidate.id) {
    problems.push(
      `the confidence report is for candidate ${intake.confidence.candidateId}, but this is candidate ${intake.candidate.id} — a report was crossed with the wrong trade`,
    );
  }

  if (intake.confidence.strategyId !== intake.candidate.strategyId) {
    problems.push(
      "the confidence report credits a different strategy than the candidate fired",
    );
  }

  if (intake.candidate.explanation.entry.length === 0) {
    problems.push("the candidate carries no evidence — nothing to explain to a trader");
  }

  if (problems.length > 0) {
    throw new IncompleteCandidateError(intake.candidate.id, problems);
  }
}

export class IncompleteCandidateError extends Error {
  constructor(
    readonly candidateId: string,
    readonly problems: string[],
  ) {
    super(
      `Candidate ${candidateId} reached the Signal Engine incomplete — this is a pipeline BUG, not a market rejection: ${problems.join("; ")}`,
    );
    this.name = "IncompleteCandidateError";
  }
}
