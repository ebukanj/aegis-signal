import { Module } from "@nestjs/common";

import { PrismaModule } from "../../core/database/prisma.module";
import { IndicatorModule } from "../indicators/indicator.module";
import { PatternModule } from "../patterns/pattern.module";
import { RegimeModule } from "../regime/regime.module";
import { MarketModule } from "../market/market.module";
import { RiskModule } from "../risk/risk.module";
import { StrategyModule } from "../strategy/strategy.module";

import { ScoreBuilder } from "./application/scoring/score.builder";
import { SimilarityEngine } from "./application/similarity/similarity.engine";
import { CalibrationService } from "./application/services/calibration.service";
import { ConfidenceService } from "./application/services/confidence.service";
import { ConfidencePipeline } from "./application/pipeline/confidence.pipeline";
import { CalibrationRepository } from "./infrastructure/repository/calibration.repository";
import { ReplayRunner } from "./infrastructure/replay/replay.runner";
import { ReplayCommand } from "./infrastructure/replay/replay.command";
import { EmptyLiveLedger, LiveLedger } from "./domain/live-ledger";

/**
 * THE CONFIDENCE & CALIBRATION ENGINE — the trust layer.
 *
 * ── The three questions, in order ──
 *
 *   The Strategy Evaluator:  "Does the setup exist?"
 *   The Risk Engine:         "Is the setup acceptable?"
 *   This engine:             "How much trust has this setup EARNED?"
 *
 * And it is the only one of the three whose honest answer, today, is *"none yet"*.
 *
 * ── What it refuses to do ──
 *
 * It never invents a confidence number. The code this platform replaced did
 * exactly that — `randInt(52, 92) + 4 per agreeing strategy` — and when the UI
 * rendered "91%" it meant nothing at all. That number is the reason ADR-024
 * exists, and this module is ADR-024 expressed as code.
 *
 * A signal is never "92% likely to win". It is "score 92 — and setups scoring in
 * this band went on to hit their first target 61% of the time across 1,284
 * replayed instances, which is a fact about a backtest and not a promise about
 * your money."
 *
 * ── The one number that matters most in this module ──
 *
 * `liveSamples: 0`.
 *
 * No signal has ever been published and settled. Everything the platform knows
 * about itself comes from replaying history that its own rules were written with
 * the benefit of. That is real evidence and it is optimistic evidence, and every
 * report says so, every time, until the ledger exists.
 */
@Module({
  imports: [
    PrismaModule,
    IndicatorModule,
    PatternModule,
    RegimeModule,
    StrategyModule,
    RiskModule,
    MarketModule,
  ],
  providers: [
    ScoreBuilder,
    SimilarityEngine,
    CalibrationRepository,
    CalibrationService,
    ConfidencePipeline,
    ConfidenceService,
    ReplayRunner,
    ReplayCommand,
    /*
     * The live ledger is EMPTY, truthfully.
     *
     * It returns zero — never the historical rate. A live ledger quietly serving
     * backtested numbers would be the most consequential lie available to this
     * platform, because a backtest can be re-run until it flatters and a live
     * result cannot. When M10 lands, this one line changes.
     */
    { provide: LiveLedger, useClass: EmptyLiveLedger },
  ],
  exports: [
    ConfidenceService,
    CalibrationService,
    ReplayRunner,
    ReplayCommand,
    CalibrationRepository,
  ],
})
export class ConfidenceModule {}
