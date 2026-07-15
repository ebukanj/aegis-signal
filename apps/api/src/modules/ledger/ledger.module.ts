import { Module } from "@nestjs/common";

import { PrismaModule } from "../../core/database/prisma.module";
import { IndicatorModule } from "../indicators/indicator.module";
import { MarketModule } from "../market/market.module";
import { SignalModule } from "../signals/signal.module";
import { ConfidenceModule } from "../confidence/confidence.module";

import { LedgerRepository } from "./infrastructure/repository/ledger.repository";
import { StatisticsEngine } from "./application/statistics/statistics.engine";
import { LedgerService } from "./application/services/ledger.service";
import { LedgerBackfillService } from "./application/services/ledger-backfill.service";
import { LedgerTracker } from "./application/tracking/ledger.tracker";
import { SettlementWorker } from "./application/settlement/settlement.worker";
import { ReplayEngine } from "./application/replay/replay.engine";
import { TrackRecordReadService } from "./application/read/track-record.read-service";
import { LedgerController } from "./ledger.controller";

/**
 * THE OUTCOME LEDGER — the permanent memory and truth of the platform.
 *
 * The previous engines answer questions about the present. This answers the one
 * that can never be revised — *what actually happened?* — once, immutably, forever.
 * It is the single source of truth the Confidence Engine calibrates against and the
 * Track Record is built from. Nothing in the platform relies on memory; everything
 * relies on this.
 *
 * ── It records; it never re-decides ──
 *
 * The ledger consumes published signals (via events) and market data, and records
 * outcomes computed from price. It never re-runs a strategy, re-scores confidence,
 * or edits a settled result. History has exactly one account, and this module
 * keeps it.
 *
 * It also makes the feed LIVE: the settlement worker settles resolved signals from
 * real candles and emits `signals.changed`, so a missed or stopped signal leaves
 * the feed on its own — no refresh (the owner's requirement).
 */
@Module({
  imports: [PrismaModule, IndicatorModule, MarketModule, SignalModule, ConfidenceModule],
  controllers: [LedgerController],
  providers: [
    LedgerRepository,
    StatisticsEngine,
    LedgerService,
    LedgerBackfillService,
    LedgerTracker,
    SettlementWorker,
    ReplayEngine,
    TrackRecordReadService,
  ],
  exports: [LedgerService, ReplayEngine],
})
export class LedgerModule {}
