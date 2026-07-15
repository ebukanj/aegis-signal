import { Injectable, Logger } from "@nestjs/common";
import {
  calibrationModelSchema,
  labelledSetupSchema,
  type CalibrationModel,
  type LabelledSetup,
} from "@aegis/contracts";
import { PrismaService } from "../../../../core/database/prisma.service";

/**
 * The evidence, on disk.
 *
 * Two rules govern this file, and both exist because the alternative is a
 * platform whose track record cannot be checked:
 *
 *   **1 · A model is never overwritten.** Versions accumulate forever. A signal
 *        published under v3 is graded against v3, even after v4 ships.
 *
 *   **2 · A setup is never counted twice.** The replay is idempotent — re-running
 *        it must not double the sample size, because a doubled sample size is a
 *        halved uncertainty, and that is the cheapest imaginable way to
 *        manufacture confidence.
 */
@Injectable()
export class CalibrationRepository {
  private readonly logger = new Logger(CalibrationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ── Setups ────────────────────────────────────────────────────── */

  async saveSetups(setups: readonly LabelledSetup[]): Promise<number> {
    if (setups.length === 0) return 0;

    const rows = setups.map((s) => ({
      strategyId: s.evidence.strategyId,
      rulesHash: s.evidence.rulesHash,
      symbol: s.evidence.symbol,
      exchange: s.evidence.exchange,
      timeframe: s.evidence.timeframe,
      direction: s.evidence.direction,
      regime: s.evidence.regime,
      volatilityState: s.evidence.volatilityState,
      volatilityBucket: s.evidence.volatilityBucket,
      liquidityBucket: s.evidence.liquidityBucket,
      riskLevel: s.evidence.riskLevel,
      patterns: [...s.evidence.patterns],
      score: s.evidence.score,
      barTime: BigInt(s.barTime),
      entryPrice: s.entryPrice,
      stopPrice: s.stopPrice,
      targetPrice: s.targetPrice,
      outcome: s.outcome,
      realisedR: s.realisedR,
      barsHeld: s.barsHeld,
      split: s.split,
    }));

    /*
     * skipDuplicates, against the unique key on the setup's IDENTITY (strategy +
     * rules + symbol + timeframe + bar). A replay that runs twice over the same
     * history adds nothing the second time — which is what makes it safe to run
     * again after a crash without silently inflating the corpus.
     */
    const result = await this.prisma.historicalSetup.createMany({
      data: rows,
      skipDuplicates: true,
    });

    if (result.count < rows.length) {
      this.logger.log(
        `${rows.length - result.count} setup(s) were already recorded and were not counted twice`,
      );
    }

    return result.count;
  }

  async setups(where?: { strategyId?: string; rulesHash?: string }): Promise<
    LabelledSetup[]
  > {
    const rows = await this.prisma.historicalSetup.findMany({
      where,
      orderBy: { barTime: "asc" },
    });

    return rows.map((row) =>
      labelledSetupSchema.parse({
        evidence: {
          strategyId: row.strategyId,
          rulesHash: row.rulesHash,
          symbol: row.symbol,
          exchange: row.exchange,
          timeframe: row.timeframe,
          direction: row.direction,
          regime: row.regime,
          volatilityState: row.volatilityState,
          volatilityBucket: row.volatilityBucket,
          liquidityBucket: row.liquidityBucket,
          riskLevel: row.riskLevel,
          patterns: row.patterns,
          score: row.score,
        },
        barTime: Number(row.barTime),
        entryPrice: row.entryPrice,
        stopPrice: row.stopPrice,
        targetPrice: row.targetPrice,
        outcome: row.outcome,
        realisedR: row.realisedR,
        barsHeld: row.barsHeld,
        split: row.split,
      }),
    );
  }

  async countSetups(): Promise<number> {
    return this.prisma.historicalSetup.count();
  }

  /* ── Models ────────────────────────────────────────────────────── */

  async latestVersion(): Promise<number> {
    const latest = await this.prisma.calibrationModel.findFirst({
      orderBy: { version: "desc" },
      select: { version: true },
    });

    return latest?.version ?? 0;
  }

  /**
   * Persist a model and make it the active one.
   *
   * The previous model is DEACTIVATED, never deleted. It still has signals
   * attached to it that claimed numbers it produced, and those claims must remain
   * checkable — a platform that deletes the model behind a prediction has made the
   * prediction unfalsifiable.
   */
  async save(model: CalibrationModel): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.calibrationModel.updateMany({
        where: { active: true },
        data: { active: false },
      }),
      this.prisma.calibrationModel.create({
        data: {
          version: model.version,
          method: model.method,
          active: true,
          corpus: model.corpus,
          bins: model.bins,
          plattA: model.plattA,
          plattB: model.plattB,
          inSample: model.inSample,
          outOfSample: model.outOfSample,
          fittedAt: new Date(model.fittedAt),
        },
      }),
    ]);
  }

  async active(): Promise<CalibrationModel | null> {
    const row = await this.prisma.calibrationModel.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
    });

    if (!row) return null;

    return calibrationModelSchema.parse({
      version: row.version,
      method: row.method,
      fittedAt: row.fittedAt.toISOString(),
      corpus: row.corpus,
      bins: row.bins,
      plattA: row.plattA,
      plattB: row.plattB,
      inSample: row.inSample,
      outOfSample: row.outOfSample,
    });
  }
}
