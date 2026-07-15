import { Injectable } from "@nestjs/common";
import {
  BUILT_IN_STRATEGIES,
  type CalibrationPoint,
  type TrackRecordView,
} from "@aegis/contracts";
import { LedgerService } from "../services/ledger.service";
import { CalibrationService } from "../../../confidence/application/services/calibration.service";

const STRATEGY_NAME = new Map(BUILT_IN_STRATEGIES.map((s) => [s.id, s.name]));

/**
 * The read side of the ledger — the public Track Record.
 *
 * It joins the two things the Track Record page shows: the ledger's record of what
 * the platform DID, and the Confidence Engine's reliability curve for how well its
 * numbers held up. Both are read, never recomputed; this service assembles the
 * view and nothing more.
 */
@Injectable()
export class TrackRecordReadService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly calibration: CalibrationService,
  ) {}

  async view(): Promise<TrackRecordView> {
    const record = await this.ledger.trackRecord();
    const model = this.calibration.model();

    const wins = record.byStrategy.reduce((sum, s) => sum + s.winners, 0);

    /* The reliability curve — predicted vs actual per bucket, from the calibration
     * model. These are the same numbers M09's replay produced; the ledger will
     * eventually contribute the LIVE curve as settled outcomes accumulate. */
    const curve: CalibrationPoint[] = (model?.outOfSample.curve ?? []).map((bin) => ({
      bucket: bin.bucket,
      predicted: Math.round(bin.predicted * 1000) / 10,
      actual: Math.round(bin.observed * 1000) / 10,
      samples: bin.samples,
    }));

    return {
      settledSignals: record.settled,
      wins,
      avgR: record.averageReturnR,
      expectancy: record.expectancy,
      trackingDays: trackingDays(record),
      totalR: record.totalR,
      profitFactor: record.profitFactor,
      largestWinnerR: record.largestWinnerR,
      largestLoserR: record.largestLoserR,
      longestWinStreak: record.longestWinStreak,
      longestLossStreak: record.longestLossStreak,

      strategies: record.byStrategy.map((s) => ({
        id: s.strategyId,
        name: STRATEGY_NAME.get(s.strategyId) ?? s.strategyId,
        enabled: true,
        signals: s.sampleSize,
        wins: s.winners,
        avgR: s.averageReturnR,
        expectancy: s.expectancy,
      })),

      /* Live curve is empty until the ledger has enough settled signals to build
       * one; the historical (replay) curve is what we show meanwhile — never merged. */
      calibration: [],
      historicalCalibration: curve,

      basis: record.basis,
    };
  }
}

function trackingDays(record: { curves: { equityR: { at: number }[] } }): number {
  const points = record.curves.equityR;
  if (points.length < 2) return 0;
  const span = points[points.length - 1].at - points[0].at;
  return Math.max(0, Math.round(span / 86_400_000));
}
