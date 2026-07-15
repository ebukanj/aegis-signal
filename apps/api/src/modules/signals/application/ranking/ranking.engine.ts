import { Injectable } from "@nestjs/common";
import type { ConfluenceReport, RiskLevel, SignalScore } from "@aegis/contracts";
import type { SignalPolicy } from "../../signal.policy";
import type { SignalCandidate } from "../../domain/intake";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * The backstage ordering score — the number that decides which of two signals is
 * stronger, and is shown to nobody.
 *
 * ── Why it is a composite, and why that is fine HERE ──
 *
 * Everywhere else the platform refuses to blend distinct measures into one opaque
 * number, because a trader deciding on a trade must see confidence, confluence and
 * risk SEPARATELY, each with its own working. A single blended "quality: 78" would
 * hide which of those was strong and which was carrying the others.
 *
 * But ranking is not a trader-facing claim — it is an internal comparison. To sort
 * a list you need one key, and the honest thing is to be explicit about the blend
 * (it is right here, weighted, in the policy) and to keep it strictly backstage.
 * The signal a trader sees still carries the three measures apart.
 *
 * ── Determinism is not optional ──
 *
 * Deterministic publication is an acceptance criterion. The same set of candidates
 * must always rank the same way, so ties are broken by the candidate id — a stable,
 * content-derived string — never by insertion order or a timestamp, both of which
 * would make a replay disagree with the run it is replaying.
 */
@Injectable()
export class RankingEngine {
  score(
    intake: SignalCandidate,
    confluence: ConfluenceReport,
    policy: SignalPolicy,
  ): SignalScore {
    const w = policy.rankingWeights;

    const confidence = intake.confidence.confidence.score;

    /*
     * Risk quality: the inverse of the assessment's heat. A LOW-risk trade is a
     * clean trade and ranks higher; this reads the level the Risk Engine already
     * decided, and inverts it. It does not re-judge the risk.
     */
    const riskQuality = RISK_QUALITY[intake.risk.assessment!.level];

    /*
     * Freshness decays linearly from the bar the candidate fired on. A setup two
     * bars stale is a setup describing a market that has moved, and it should rank
     * below an identical one that just fired.
     */
    const barMs = timeframeMs(intake.candidate.timeframe);
    const ageBars = Math.max(0, (intake.now - intake.candidate.barTime) / barMs - 1);
    const freshness = Math.max(
      0,
      100 * (1 - ageBars / Math.max(1, policy.maximumAgeBars + 1)),
    );

    const total =
      w.confidence * confidence +
      w.confluence * confluence.score +
      w.riskQuality * riskQuality +
      w.freshness * freshness;

    return {
      total: round2(Math.max(0, Math.min(100, total))),
      confidence: round2(confidence),
      confluence: round2(confluence.score),
      riskQuality: round2(riskQuality),
      freshness: round2(freshness),
    };
  }

  /**
   * Compare two scored candidates for ranking. Higher total first; ties broken by
   * candidate id so the order is total and reproducible.
   */
  static compare(
    a: { score: SignalScore; id: string },
    b: { score: SignalScore; id: string },
  ): number {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    /* A deterministic, content-derived tiebreak — never insertion order. */
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
}

const RISK_QUALITY: Record<RiskLevel, number> = {
  LOW: 100,
  MODERATE: 65,
  ELEVATED: 35,
  HIGH: 10,
};

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
