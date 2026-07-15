import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  EVENT,
  calibrationModelSchema,
  type CalibrationModel,
  type LabelledSetup,
  type MarketRegime,
  type StrategyReliability,
} from "@aegis/contracts";

import { DEFAULT_CONFIDENCE_POLICY, type ConfidencePolicy } from "../../confidence.policy";
import { shrink } from "../bayesian/beta";
import { fitIsotonic, fitPlatt, fitShrinkage, type Calibrator } from "../calibration/calibrators";
import { baselineBrier, reliability, type Prediction } from "../reliability/reliability";
import { CalibrationRepository } from "../../infrastructure/repository/calibration.repository";

/**
 * Fits the model that turns a score into a probability, and grades it in public.
 *
 * ── The one thing this service must never do ──
 *
 * Choose a calibration method because somebody liked it.
 *
 * All three are fitted on the same calibration split and all three are graded on
 * the same validation split, and the one that ships is the one with the lowest
 * out-of-sample ECE. That is the whole selection rule. It is written down here
 * rather than decided in a meeting, and it means the platform can be wrong about
 * its favourite method and still ship the right one.
 */
@Injectable()
export class CalibrationService {
  private readonly logger = new Logger(CalibrationService.name);

  private active: CalibrationModel | null = null;
  private calibrator: Calibrator | null = null;

  constructor(
    private readonly repository: CalibrationRepository,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  /** The model currently speaking. Null until a replay has been run. */
  model(): CalibrationModel | null {
    return this.active;
  }

  /**
   * Score → probability, under the active model.
   *
   * Returns null when there is no model, and the null is the point: an
   * uncalibrated score has no win rate, and the contract refuses to carry one.
   * There is no fallback value here, no "assume 50%", no global base rate
   * standing in — because every one of those would put a plausible number in
   * front of a trader for a question the platform cannot answer.
   */
  probability(score: number): number | null {
    if (!this.calibrator || !this.active) return null;

    /*
     * A bucket with too little evidence behind it does not get to speak either.
     * A model can be "active" and still know nothing about the specific score in
     * front of it.
     */
    const bucket = this.active.bins.find(
      (b) =>
        score >= b.bucket && score < b.bucket + DEFAULT_CONFIDENCE_POLICY.bucketWidth,
    );

    if (!bucket || bucket.samples < DEFAULT_CONFIDENCE_POLICY.minimumSamplesForCalibration) {
      return null;
    }

    return this.calibrator.apply(score);
  }

  /** How many replayed setups sit behind the probability for this score. */
  samplesFor(score: number): number {
    if (!this.active) return 0;

    const bucket = this.active.bins.find(
      (b) =>
        score >= b.bucket && score < b.bucket + DEFAULT_CONFIDENCE_POLICY.bucketWidth,
    );

    return bucket?.samples ?? 0;
  }

  /* ── Fitting ───────────────────────────────────────────────────── */

  /**
   * Fit all three calibrators, grade them out-of-sample, ship the best.
   */
  async fit(
    setups: readonly LabelledSetup[],
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): Promise<CalibrationModel> {
    if (setups.length === 0) {
      throw new Error(
        "Cannot fit a calibration model on zero setups — there is nothing to be calibrated against, and a model fitted on nothing would be an opinion with a version number",
      );
    }

    const calibration = setups.filter((s) => s.split === "CALIBRATION");
    const validation = setups.filter((s) => s.split === "VALIDATION");

    if (calibration.length === 0 || validation.length === 0) {
      throw new Error(
        `The walk-forward split collapsed: ${calibration.length} to fit and ${validation.length} to grade. ` +
          `A model with no validation half cannot be graded, and a model that cannot be graded cannot be trusted.`,
      );
    }

    const toPrediction = (s: LabelledSetup): { score: number; outcome: 0 | 1 } => ({
      score: s.evidence.score,
      /*
       * EXPIRED is a NON-WIN. It stays in the denominator.
       *
       * Dropping the setups that went nowhere — keeping every trade that worked —
       * is the oldest way in the world to manufacture a win rate.
       */
      outcome: s.outcome === "WIN" ? 1 : 0,
    });

    const fitRows = calibration.map(toPrediction);
    const gradeRows = validation.map(toPrediction);

    const candidates: Calibrator[] = [
      fitShrinkage(
        fitRows.map((r) => ({ ...r, predicted: 0 })),
        policy.bucketWidth,
        policy.priorStrength,
      ),
      fitPlatt(fitRows.map((r) => ({ ...r, predicted: 0 }))),
      fitIsotonic(
        fitRows.map((r) => ({ ...r, predicted: 0 })),
        policy.bucketWidth,
      ),
    ];

    const graded = candidates.map((calibrator) => {
      const inSample: Prediction[] = fitRows.map((r) => ({
        ...r,
        predicted: calibrator.apply(r.score),
      }));

      const outOfSample: Prediction[] = gradeRows.map((r) => ({
        ...r,
        predicted: calibrator.apply(r.score),
      }));

      return {
        calibrator,
        inSample: reliability(inSample, policy.bucketWidth),
        outOfSample: reliability(outOfSample, policy.bucketWidth),
      };
    });

    for (const g of graded) {
      this.logger.log(
        `${g.calibrator.method.padEnd(9)} in-sample ECE ${g.inSample.ece.toFixed(4)} · ` +
          `OUT-OF-SAMPLE ECE ${g.outOfSample.ece.toFixed(4)} · Brier ${g.outOfSample.brier.toFixed(4)} · ` +
          `log loss ${g.outOfSample.logLoss.toFixed(4)}`,
      );
    }

    /*
     * The selection rule, and the ONLY selection rule.
     *
     * Out-of-sample ECE. Not in-sample — isotonic wins in-sample essentially every
     * time, because fitting the noise exactly is what it does, and a method chosen
     * on its in-sample score is a method chosen for its ability to memorise.
     */
    const winner = graded.reduce((best, g) =>
      g.outOfSample.ece < best.outOfSample.ece ? g : best,
    );

    /*
     * And the sanity check that decides whether ANY of them earned their keep.
     *
     * Predicting the base rate at everything is the null model: perfectly
     * calibrated on average, and completely useless, because it distinguishes
     * nothing from anything. A calibrator that cannot beat it on Brier has added
     * nothing but complexity, and the platform should say so out loud rather than
     * ship a machine that exists to look sophisticated.
     */
    const nullModel = baselineBrier(
      gradeRows.map((r) => ({ ...r, predicted: 0 })),
    );

    if (winner.outOfSample.brier >= nullModel) {
      this.logger.warn(
        `The best calibrator (${winner.calibrator.method}) scores Brier ${winner.outOfSample.brier.toFixed(4)} ` +
          `against ${nullModel.toFixed(4)} for simply predicting the base rate at everything. ` +
          `THE SCORE IS NOT SEPARATING WINNERS FROM LOSERS. The contributor weights in confidence.policy.ts are the thing to fix — ` +
          `not the calibrator, which is faithfully reporting that its input carries no signal.`,
      );
    }

    const wins = setups.filter((s) => s.outcome === "WIN").length;
    const losses = setups.filter((s) => s.outcome === "LOSS").length;
    const expired = setups.filter((s) => s.outcome === "EXPIRED").length;

    /* Streaming, not spread — the corpus can carry more timestamps than the spread
     * operator's argument limit allows onto the stack. See ReplayCommand for the
     * crash this prevents. */
    let from = Number.POSITIVE_INFINITY;
    let to = Number.NEGATIVE_INFINITY;
    let splitAt = Number.POSITIVE_INFINITY;

    for (const s of setups) {
      if (s.barTime < from) from = s.barTime;
      if (s.barTime > to) to = s.barTime;
      if (s.split === "VALIDATION" && s.barTime < splitAt) splitAt = s.barTime;
    }

    const version = (await this.repository.latestVersion()) + 1;

    const model = calibrationModelSchema.parse({
      version,
      method: winner.calibrator.method,
      fittedAt: new Date().toISOString(),
      corpus: {
        symbols: [...new Set(setups.map((s) => s.evidence.symbol))].sort(),
        timeframes: [...new Set(setups.map((s) => s.evidence.timeframe))],
        from,
        to,
        splitAt,
        setups: setups.length,
        calibrationSetups: calibration.length,
        validationSetups: validation.length,
        wins,
        losses,
        expired,
      },
      bins: winner.calibrator.bins.length > 0
        ? winner.calibrator.bins
        : winner.inSample.curve,
      plattA: winner.calibrator.params.a,
      plattB: winner.calibrator.params.b,
      inSample: winner.inSample,
      outOfSample: winner.outOfSample,
    });

    await this.repository.save(model);
    await this.load();

    for (const bin of model.bins) {
      this.events.emit(EVENT.CALIBRATION_UPDATED, {
        name: EVENT.CALIBRATION_UPDATED,
        at: model.fittedAt,
        scoreBucket: bin.bucket,
        actualWinRate: bin.observed,
        samples: bin.samples,
        basis: "HISTORICAL",
      });
    }

    return model;
  }

  /* ── Strategy reliability ──────────────────────────────────────── */

  /**
   * A strategy's record. Every field a fact about outcomes; not one a forecast.
   *
   * `shrunkWinRate` is what the platform actually believes. The raw `winRate` is
   * reported next to it, honestly, and it is the more dangerous of the two — three
   * wins from three is a 100% win rate and it is not evidence of anything.
   */
  reliabilityOf(
    strategyId: string,
    rulesHash: string,
    setups: readonly LabelledSetup[],
    policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
  ): StrategyReliability {
    const mine = setups.filter(
      (s) => s.evidence.strategyId === strategyId && s.evidence.rulesHash === rulesHash,
    );

    const globalBaseRate =
      setups.length > 0
        ? setups.filter((s) => s.outcome === "WIN").length / setups.length
        : 0.5;

    const wins = mine.filter((s) => s.outcome === "WIN").length;
    const losses = mine.filter((s) => s.outcome === "LOSS").length;
    const expired = mine.filter((s) => s.outcome === "EXPIRED").length;

    const gross = mine.reduce(
      (acc, s) => {
        if (s.realisedR > 0) acc.profit += s.realisedR;
        else acc.loss += Math.abs(s.realisedR);
        return acc;
      },
      { profit: 0, loss: 0 },
    );

    const totalR = mine.reduce((sum, s) => sum + s.realisedR, 0);

    /* The equity curve's worst peak-to-trough, in R. */
    let peak = 0;
    let equity = 0;
    let drawdown = 0;

    for (const setup of [...mine].sort((a, b) => a.barTime - b.barTime)) {
      equity += setup.realisedR;
      peak = Math.max(peak, equity);
      drawdown = Math.max(drawdown, peak - equity);
    }

    const regimes = [...new Set(mine.map((s) => s.evidence.regime))] as MarketRegime[];

    return {
      strategyId,
      rulesHash,
      samples: mine.length,
      wins,
      losses,
      expired,
      winRate: mine.length > 0 ? wins / mine.length : null,
      shrunkWinRate:
        mine.length > 0
          ? shrink(wins, mine.length, globalBaseRate, policy.priorStrength).mean
          : null,
      /*
       * Null, not Infinity, when nothing has lost yet. A profit factor of Infinity
       * is not an outstanding strategy — it is a strategy that has not lost YET,
       * and rendering "∞" next to a win rate is how a platform talks somebody into
       * a position they cannot afford.
       */
      profitFactor: gross.loss > 0 ? gross.profit / gross.loss : null,
      expectancy: mine.length > 0 ? totalR / mine.length : null,
      maxDrawdownR: mine.length > 0 ? drawdown : null,
      recoveryFactor: drawdown > 0 ? totalR / drawdown : null,
      averageBarsHeld:
        mine.length > 0
          ? mine.reduce((sum, s) => sum + s.barsHeld, 0) / mine.length
          : null,
      byRegime: regimes.map((regime) => {
        const inRegime = mine.filter((s) => s.evidence.regime === regime);
        const regimeWins = inRegime.filter((s) => s.outcome === "WIN").length;

        return {
          regime,
          samples: inRegime.length,
          winRate: inRegime.length > 0 ? regimeWins / inRegime.length : null,
          expectancy:
            inRegime.length > 0
              ? inRegime.reduce((sum, s) => sum + s.realisedR, 0) / inRegime.length
              : null,
        };
      }),
    };
  }

  private async load(): Promise<void> {
    this.active = await this.repository.active();

    if (!this.active) {
      this.calibrator = null;
      this.logger.warn(
        "No calibration model exists. Every score will be reported UNCALIBRATED and carry NO win rate — which is the honest state of a platform that has not yet replayed any history.",
      );
      return;
    }

    /*
     * The model is rebuilt from its stored bins rather than refitted, so a
     * restart cannot silently change what a version means. A model version is a
     * promise about what a number meant on the day it was published; refitting it
     * on boot would make that promise depend on the boot.
     */
    const model = this.active;
    const width = DEFAULT_CONFIDENCE_POLICY.bucketWidth;

    if (model.method === "PLATT" && model.plattA !== null && model.plattB !== null) {
      const a = model.plattA;
      const b = model.plattB;

      this.calibrator = {
        method: "PLATT",
        params: { a, b },
        bins: model.bins,
        apply: (score) => 1 / (1 + Math.exp(-(a * ((score - 50) / 25) + b))),
      };
    } else {
      const table = new Map(model.bins.map((bin) => [bin.bucket, bin.predicted]));
      const fallback = model.outOfSample.baseRate;

      this.calibrator = {
        method: model.method,
        params: { a: null, b: null },
        bins: model.bins,
        apply: (score) =>
          table.get(Math.floor(score / width) * width) ?? fallback,
      };
    }

    this.logger.log(
      `Calibration v${model.version} (${model.method}) — ${model.corpus.setups} setups, ` +
        `out-of-sample ECE ${model.outOfSample.ece.toFixed(4)}, base rate ${(model.outOfSample.baseRate * 100).toFixed(1)}%`,
    );
  }
}
