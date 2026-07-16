import { Module } from "@nestjs/common";

import { IndicatorModule } from "../indicators/indicator.module";
import { PatternModule } from "../patterns/pattern.module";
import { RegimeModule } from "../regime/regime.module";
import { StrategyModule } from "../strategy/strategy.module";
import { RiskModule } from "../risk/risk.module";
import { ConfidenceModule } from "../confidence/confidence.module";
import { MarketModule } from "../market/market.module";
import { SignalModule } from "../signals/signal.module";
import { AuthModule } from "../auth/auth.module";

import { ScanOrchestrator } from "./application/scan.orchestrator";
import { ScanService } from "./application/scan.service";
import { ScanWorker } from "./application/scan.worker";
import { ScanController } from "./scan.controller";

/**
 * THE LIVE SCAN — the top of the intelligence pipeline (M15).
 *
 * Everything downstream of "does a setup exist?" was built and tested; nothing was
 * continuously ASKING that question across the market. This module is what asks it.
 * It owns no analysis: it imports the engines that own indicators, patterns,
 * regime, strategy, risk and confidence, and orchestrates them on the newest bar
 * for a bounded universe across every enabled exchange, then hands the survivors to
 * the Signal Engine to publish.
 *
 * It reuses; it never re-derives. Every number in a scanned candidate was produced
 * by the engine that owns it (AGENTS.md §2). The scanner and the live feed are the
 * same pipeline — the scanner is just the trader watching it run.
 */
@Module({
  imports: [
    IndicatorModule,
    PatternModule,
    RegimeModule,
    StrategyModule,
    RiskModule,
    ConfidenceModule,
    MarketModule,
    SignalModule,
    AuthModule,
  ],
  controllers: [ScanController],
  providers: [ScanOrchestrator, ScanService, ScanWorker],
  exports: [ScanService],
})
export class ScanModule {}
