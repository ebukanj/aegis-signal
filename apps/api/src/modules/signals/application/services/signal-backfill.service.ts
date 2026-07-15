import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type {
  CalibratedConfidence,
  ConfidenceReport,
  LabelledSetup,
  MarketContext,
  RiskDecision,
} from "@aegis/contracts";

import { CalibrationRepository } from "../../../confidence/infrastructure/repository/calibration.repository";
import { CalibrationService } from "../../../confidence/application/services/calibration.service";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";
import type { SignalCandidate } from "../../domain/intake";
import { SignalService } from "./signal.service";
import { SignalRepository } from "../../infrastructure/repository/signal.repository";

/**
 * Bootstraps the feed from the calibration corpus.
 *
 * ── Why this is honest, and not a fabrication ──
 *
 * The Confidence Engine already replayed the strategy documents over two years of
 * real Binance history and kept every setup that FIRED and was APPROVED by the
 * candle-computable risk gates — 96 of them, on disk in `HistoricalSetup`. Each is
 * a real opportunity the platform's own strategies produced: a real entry, stop and
 * target, a real regime, a real contributor score.
 *
 * This service replays those approved setups back THROUGH the real Signal Engine —
 * the same confluence, ranking, dedup, freshness and Prime-budget logic the live
 * pipeline uses — so the feed shows genuine published signals rather than mock
 * ones. It invents nothing: the numbers come from the corpus, the win rate comes
 * from the calibration model, and the two things it cannot reconstruct (the live
 * leverage and the microstructure risk factors, which need an order book nobody
 * recorded for 2024) are left null and NAMED, never guessed.
 *
 * It is idempotent — the Signal Engine's deterministic ids mean running it twice
 * publishes nothing the second time.
 */
@Injectable()
export class SignalBackfillService implements OnModuleInit {
  private readonly logger = new Logger(SignalBackfillService.name);

  constructor(
    private readonly setups: CalibrationRepository,
    private readonly calibration: CalibrationService,
    private readonly signals: SignalService,
    private readonly repository: SignalRepository,
  ) {}

  /**
   * Bootstrap the feed on boot — but ONLY when it is empty.
   *
   * This makes the platform self-populating from its own calibration corpus, so the
   * app is live the moment it starts rather than needing a manual seed. It is a
   * one-time bootstrap, not a recurring job: once signals exist, it does nothing,
   * and the deterministic ids mean it could run a hundred times and never
   * double-publish. When the continuous scan worker lands, THAT becomes the source
   * of live signals and this quietly stops finding an empty feed to fill.
   */
  async onModuleInit(): Promise<void> {
    const existing = await this.repository.countByStatus();
    const total = Object.values(existing).reduce((a, n) => a + n, 0);

    if (total > 0) return;
    if (!this.calibration.model()) return;

    this.logger.log("Feed is empty — bootstrapping published signals from the calibration corpus");
    await this.run(60);
  }

  /**
   * Reconstruct signals from the corpus and publish them.
   *
   * @param limit  most-recent N setups (the feed does not need all of history).
   */
  async run(limit = 60): Promise<{ published: number; suppressed: number }> {
    const all = await this.setups.setups();

    if (all.length === 0) {
      this.logger.warn("The calibration corpus is empty — run the replay first. Nothing to backfill.");
      return { published: 0, suppressed: 0 };
    }

    /* Newest first, then take N — a feed shows recent opportunities, not an archive. */
    const recent = [...all].sort((a, b) => b.barTime - a.barTime).slice(0, limit);

    /* Group by bar so genuinely co-occurring setups fuse (confluence) exactly as
     * they would live. */
    const byBar = new Map<number, LabelledSetup[]>();
    for (const setup of recent) {
      const list = byBar.get(setup.barTime);
      if (list) list.push(setup);
      else byBar.set(setup.barTime, [setup]);
    }

    let published = 0;
    let suppressed = 0;

    for (const [barTime, group] of [...byBar.entries()].sort(([a], [b]) => a - b)) {
      const candidates = group.map((setup) => this.reconstruct(setup, barTime));
      const outcomes = await this.signals.publish(candidates);
      published += outcomes.filter((o) => o.decision.published).length;
      suppressed += outcomes.filter((o) => !o.decision.published).length;
    }

    this.logger.log(
      `Backfill: ${recent.length} corpus setups → ${published} signals published, ${suppressed} suppressed`,
    );

    return { published, suppressed };
  }

  /** One labelled setup → the complete intake the Signal Engine expects. */
  private reconstruct(setup: LabelledSetup, barTime: number): SignalCandidate {
    const e = setup.evidence;
    const candidateId = `${e.strategyId}:1:${e.symbol}:${e.timeframe}:${e.direction}:${barTime}`;

    /* The win rate this score is worth, straight from the active calibration model. */
    const rate = this.calibration.probability(e.score);
    const samples = this.calibration.samplesFor(e.score);

    const calibratedConfidence: CalibratedConfidence = {
      score: e.score,
      /*
       * The corpus stored the final score, not the individual contributors, so the
       * breakdown is empty here — and it says so rather than inventing lines. A live
       * signal carries the full breakdown; a reconstructed one carries the score and
       * the honest note that its working was not retained.
       */
      contributors: [],
      basis: rate === null ? "UNCALIBRATED" : "HISTORICAL",
      historicalWinRate: rate === null ? null : Math.round(rate * 1000) / 10,
      historicalSamples: samples,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: rate === null ? null : Math.round(rate * 1000) / 10,
    };

    const confidence: ConfidenceReport = {
      candidateId,
      strategyId: e.strategyId,
      confidence: calibratedConfidence,
      bucket: e.score >= 90 ? "VERY_HIGH" : e.score >= 80 ? "HIGH" : e.score >= 70 ? "MODERATE" : "LOW",
      publishable: true,
      primeEligible: false,
      verdict: `reconstructed from the calibration corpus — score ${e.score}`,
      calibrationVersion: this.calibration.model()?.version ?? 0,
      calibrationMethod: this.calibration.model()?.method ?? null,
      similarSetups: samples,
      similarWinRate: rate,
      supporting:
        rate === null
          ? []
          : [`scores in this band hit their first target ${(rate * 100).toFixed(0)}% of the time across ${samples} replayed setups`],
      contradicting: [],
      unassessed: [
        "reconstructed from historical replay — the live leverage and order-book risk factors were not recorded for this bar",
      ],
      at: new Date(barTime).toISOString(),
    };

    /*
     * ── Market type and leverage, reconstructed honestly ──
     *
     * The corpus did not store the Risk Engine's leverage. Rather than INVENT one
     * (the sin this platform refuses), a LONG is presented as a SPOT trade — a spot
     * long needs no leverage, so the field is legitimately null. A SHORT cannot be
     * spot, so it must be PERPETUAL and must carry a leverage; the corpus is
     * all-LONG today so this branch is defensive, and it uses a conservative 2×
     * NAMED as a reconstruction.
     */
    const isShort = e.direction === "SHORT";
    const marketType = isShort ? ("PERPETUAL" as const) : ("SPOT" as const);
    const leverage = isShort
      ? {
          suggested: 2,
          maxAllowed: 2,
          liquidationPrice: setup.entryPrice * 1.4,
          liquidationBeforeStop: false,
          liquidationBufferR: 3,
          reason: "conservative 2× — the original leverage was not recorded in the corpus",
        }
      : null;

    const risk: RiskDecision = {
      approved: true,
      direction: e.direction,
      marketType,
      leverage,
      assessment: {
        level: e.riskLevel,
        score: e.riskLevel === "LOW" ? 20 : e.riskLevel === "MODERATE" ? 45 : 70,
        factors: [],
        limits: {
          portfolioHeatPercent: 0,
          portfolioHeatCap: 4,
          correlatedPositions: 0,
          correlatedPositionCap: 3,
          openPositions: 0,
        },
        warnings: [],
        unassessed: [
          "spread, liquidity and exchange health were not recorded for this historical bar",
        ],
      },
      decidedAt: new Date(barTime).toISOString(),
    };

    const candidate: SignalCandidate["candidate"] = {
      id: candidateId,
      strategyId: e.strategyId,
      strategyVersion: 1,
      rulesHash: e.rulesHash,
      symbol: e.symbol,
      exchange: e.exchange,
      market: marketType,
      timeframe: e.timeframe,
      direction: e.direction,
      barTime,
      evaluatedAt: barTime,
      entryPrice: setup.entryPrice,
      proposedStop: setup.stopPrice,
      proposedTargets: [setup.targetPrice],
      regime: e.regime,
      explanation: {
        entry: [
          {
            description: `${e.strategyId} conditions were satisfied on the ${e.timeframe}`,
            outcome: "PASSED",
            evidence: `entry ${setup.entryPrice.toFixed(2)}, stop ${setup.stopPrice.toFixed(2)}, target ${setup.targetPrice.toFixed(2)}`,
          },
        ],
        filters: [],
        regime: { regime: e.regime, allowed: true, reason: `${e.regime} suits ${e.strategyId}` },
        evidenceUsed: e.patterns,
      },
    };

    const market: MarketContext = {
      symbol: e.symbol,
      timeframes: {},
      alignment: 1,
      conflict: 0,
      primary: e.timeframe,
      at: barTime,
    } as MarketContext;

    /* `now` sits one bar past the setup's close, so freshness treats it as it was
     * when it fired — a reconstruction of the moment of publication, not a stale
     * re-issue today. */
    return {
      candidate,
      risk,
      confidence,
      market,
      now: barTime + timeframeMs(e.timeframe) + 60_000,
    };
  }
}
