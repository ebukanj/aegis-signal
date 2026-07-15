import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ConfidenceReport, EvidenceSnapshot, LabelledSetup } from "@aegis/contracts";

import {
  DEFAULT_CONFIDENCE_POLICY,
  assertConfidencePolicyCoherent,
  type ConfidencePolicy,
} from "../../confidence.policy";
import type { ScoringContext } from "../../domain/scoring";
import { ConfidencePipeline } from "../pipeline/confidence.pipeline";
import { CalibrationService } from "./calibration.service";
import { CalibrationRepository } from "../../infrastructure/repository/calibration.repository";

/**
 * The Confidence Engine's front door.
 *
 * The Strategy Evaluator asks: *does the setup exist?*
 * The Risk Engine asks:        *is the setup acceptable?*
 * This asks:                   *how much trust has this setup EARNED?*
 *
 * And the answer is frequently "none yet", which is a real answer and is
 * reported as one.
 */
@Injectable()
export class ConfidenceService implements OnModuleInit {
  private readonly logger = new Logger(ConfidenceService.name);

  private readonly policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY;

  /**
   * The corpus, held in memory.
   *
   * It is tens of thousands of small rows at most, it is read on every single
   * assessment, and it changes only when a replay runs. Reading it from Postgres
   * per signal would put a database round-trip inside the hot path for data that
   * cannot have changed.
   */
  private corpus: LabelledSetup[] = [];

  private assessed = 0;
  private published = 0;
  private readonly bucketCounts = new Map<string, number>();

  constructor(
    private readonly pipeline: ConfidencePipeline,
    private readonly calibration: CalibrationService,
    private readonly repository: CalibrationRepository,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    /*
     * A self-contradicting policy would reject every signal, silently, for a
     * reason nobody could ever find. Refused at boot, exactly as the Risk
     * Engine's is.
     */
    assertConfidencePolicyCoherent(this.policy);

    await this.reload();
  }

  /** Re-read the corpus after a replay has added to it. */
  async reload(): Promise<void> {
    this.corpus = await this.repository.setups();

    if (this.corpus.length === 0) {
      this.logger.warn(
        "The historical corpus is EMPTY. No strategy has any evidence behind it, every score will be UNCALIBRATED, and no signal can carry a win rate. Run the replay.",
      );
      return;
    }

    const wins = this.corpus.filter((s) => s.outcome === "WIN").length;

    this.logger.log(
      `Corpus: ${this.corpus.length} labelled setups, base rate ${((wins / this.corpus.length) * 100).toFixed(1)}%`,
    );
  }

  /**
   * Assess an approved candidate.
   *
   * The candidate must ALREADY have been approved by the Risk Engine. This engine
   * does not veto and cannot rescue — a trade the Risk Engine killed does not get
   * a confidence score, because scoring it would imply it was a trade at all.
   */
  async assess(input: {
    context: ScoringContext;
    evidence: EvidenceSnapshot;
  }): Promise<ConfidenceReport> {
    const report = await this.pipeline.assess({
      context: input.context,
      evidence: input.evidence,
      corpus: this.corpus,
      policy: this.policy,
    });

    this.assessed += 1;
    if (report.publishable) this.published += 1;

    this.bucketCounts.set(
      report.bucket,
      (this.bucketCounts.get(report.bucket) ?? 0) + 1,
    );

    this.events.emit("confidence.calculated", {
      candidateId: report.candidateId,
      score: report.confidence.score,
      basis: report.confidence.basis,
      bucket: report.bucket,
      publishable: report.publishable,
    });

    if (!report.publishable) {
      this.events.emit("confidence.rejected", {
        candidateId: report.candidateId,
        score: report.confidence.score,
        verdict: report.verdict,
      });
    }

    return report;
  }

  /* ── Administration ────────────────────────────────────────────── */

  /**
   * What the platform knows about its own reliability.
   *
   * `calibrationHealth` is the number an operator should watch. It is the
   * out-of-sample expected calibration error — the average gap between what the
   * platform said and what happened. If it drifts upward, the scorer is lying and
   * the contributor weights need retuning; there is no other conclusion available.
   */
  async metrics(): Promise<Record<string, unknown>> {
    const model = this.calibration.model();

    return {
      assessed: this.assessed,
      published: this.published,
      publicationRate: this.assessed > 0 ? this.published / this.assessed : null,
      buckets: Object.fromEntries(this.bucketCounts),

      corpusSetups: this.corpus.length,
      corpusBaseRate:
        this.corpus.length > 0
          ? this.corpus.filter((s) => s.outcome === "WIN").length / this.corpus.length
          : null,

      calibrationVersion: model?.version ?? null,
      calibrationMethod: model?.method ?? null,

      /* THE number. The platform's own error, measured out of sample. */
      calibrationErrorOutOfSample: model?.outOfSample.ece ?? null,
      calibrationErrorWorstBucket: model?.outOfSample.mce ?? null,
      brier: model?.outOfSample.brier ?? null,
      logLoss: model?.outOfSample.logLoss ?? null,

      /*
       * Stated plainly, because it is the single most important fact about this
       * platform's confidence numbers and it must not be buried in a log line.
       */
      liveSignalsSettled: 0,
      warning:
        "No signal has ever been published and settled. Every win rate this platform reports comes from replayed history, which is optimistic by construction — the rules were written by people who had already seen it.",
    };
  }
}
