import { Injectable } from "@nestjs/common";
import {
  calibratedConfidenceSchema,
  confidenceReportSchema,
  type CalibratedConfidence,
  type ConfidenceBucket,
  type ConfidenceReport,
  type EvidenceSnapshot,
  type LabelledSetup,
} from "@aegis/contracts";

import { DEFAULT_CONFIDENCE_POLICY, type ConfidencePolicy } from "../../confidence.policy";
import type { ScoringContext } from "../../domain/scoring";
import { LiveLedger } from "../../domain/live-ledger";
import { blend } from "../bayesian/beta";
import { ScoreBuilder } from "../scoring/score.builder";
import { SimilarityEngine } from "../similarity/similarity.engine";
import { CalibrationService } from "../services/calibration.service";
import { explain } from "../services/explanation.builder";

/**
 * Evidence → score → probability → report.
 *
 * The pipeline's whole job is to keep two things apart that every other trading
 * platform merges:
 *
 *   **The SCORE** — how much evidence supports this setup. Arithmetic on candles.
 *   Real on the first bar the platform ever sees. Owes nothing to history.
 *
 *   **The PROBABILITY** — what a score like this has historically been WORTH. A
 *   claim about outcomes, and it must be earned from them or not made at all.
 *
 * A signal is never "92% likely to win". It is "score 92 — and setups scoring in
 * this band have gone on to hit their first target 61% of the time across 1,284
 * replayed instances". Those are different sentences, and only the second one is
 * true.
 */
@Injectable()
export class ConfidencePipeline {
  constructor(
    private readonly scorer: ScoreBuilder,
    private readonly similarity: SimilarityEngine,
    private readonly calibration: CalibrationService,
    private readonly ledger: LiveLedger,
  ) {}

  async assess(input: {
    context: ScoringContext;
    evidence: EvidenceSnapshot;
    corpus: readonly LabelledSetup[];
    policy?: ConfidencePolicy;
  }): Promise<ConfidenceReport> {
    const policy = input.policy ?? DEFAULT_CONFIDENCE_POLICY;
    const { context, evidence, corpus } = input;

    /* ── 1 · The score ─────────────────────────────────────────── */

    const { score, contributors } = this.scorer.build(context);

    /* ── 2 · Have we seen this before? ─────────────────────────── */

    const similar = this.similarity.search({ ...evidence, score }, corpus);

    /* ── 3 · What has a score like this been worth? ────────────── */

    const model = this.calibration.model();
    const bucket = Math.floor(score / policy.bucketWidth) * policy.bucketWidth;

    const historicalRate = this.calibration.probability(score);
    const historicalSamples = this.calibration.samplesFor(score);

    /* ── 4 · What have OUR OWN signals done? ───────────────────── */

    const live = await this.ledger.forBucket(bucket);

    /*
     * The blend. History is the PRIOR; live is the EVIDENCE. Evidence overrides a
     * prior; a prior never overrides evidence — and the two are never merged
     * behind one unlabelled number. The basis always says which is speaking.
     */
    const blended = blend(
      historicalSamples > 0 && historicalRate !== null
        ? {
            wins: Math.round(historicalRate * historicalSamples),
            samples: historicalSamples,
          }
        : null,
      live,
      model?.outOfSample.baseRate ?? 0.5,
      policy.priorStrength,
      policy.liveDominanceSamples,
    );

    const confidence: CalibratedConfidence = calibratedConfidenceSchema.parse({
      score,
      contributors,
      basis: blended.basis,
      historicalWinRate: historicalRate === null ? null : historicalRate * 100,
      historicalSamples,
      liveWinRate: live.samples > 0 ? (live.wins / live.samples) * 100 : null,
      liveSamples: live.samples,
      /*
       * Null when UNCALIBRATED — and the contract enforces it. There is no
       * fallback here, no "assume the base rate", because a plausible number in
       * front of a question we cannot answer is worse than an admission.
       */
      displayedWinRate: blended.rate === null ? null : blended.rate * 100,
    });

    /* ── 5 · Thresholds ────────────────────────────────────────── */

    const tier = this.bucketOf(score, policy);
    const publishable = score >= policy.publishAt;

    /*
     * Prime.
     *
     * ADR-023 §4: UNPROVEN strategies are barred from Prime, and every strategy
     * in this platform is currently UNPROVEN. So this is false today, for every
     * signal, and it will stay false until a strategy has a settled LIVE record —
     * not a replayed one.
     *
     * A backtest does not earn a strategy the platform's most prominent slot. If
     * it did, the slot would mean nothing, and Prime is supposed to be the one
     * place the platform stakes its reputation.
     */
    const proven = model !== null && live.samples >= policy.liveDominanceSamples;
    const primeEligible = publishable && score >= policy.primeAt && proven;

    /* ── 6 · Say it in words ───────────────────────────────────── */

    const { supporting, contradicting, unassessed, verdict } = explain({
      score,
      contributors,
      confidence,
      similar,
      model,
      publishable,
      primeEligible,
      proven,
      policy,
      context,
    });

    return confidenceReportSchema.parse({
      candidateId: context.candidate.id,
      strategyId: context.candidate.strategyId,
      confidence,
      bucket: tier,
      publishable,
      primeEligible,
      verdict,
      calibrationVersion: model?.version ?? 0,
      calibrationMethod: model?.method ?? null,
      similarSetups: similar.matches.length,
      similarWinRate: similar.winRate,
      supporting,
      contradicting,
      unassessed,
      at: new Date().toISOString(),
    });
  }

  private bucketOf(score: number, policy: ConfidencePolicy): ConfidenceBucket {
    for (const tier of policy.tiers) {
      if (score >= tier.floor) return tier.bucket;
    }
    return "DO_NOT_PUBLISH";
  }
}
