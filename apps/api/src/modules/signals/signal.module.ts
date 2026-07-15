import { Module } from "@nestjs/common";

import { PrismaModule } from "../../core/database/prisma.module";
import { IndicatorModule } from "../indicators/indicator.module";
import { ConfidenceModule } from "../confidence/confidence.module";

import { ConfluenceEngine } from "./application/confluence/confluence.engine";
import { RankingEngine } from "./application/ranking/ranking.engine";
import { FreshnessService } from "./application/freshness/freshness.service";
import { DeduplicationService } from "./application/deduplication/deduplication.service";
import { PrimeBudgetManager } from "./application/budget/prime-budget.manager";
import { LifecycleManager } from "./application/lifecycle/lifecycle.manager";
import { SignalBuilder } from "./application/publication/signal.builder";
import { PublicationPipeline } from "./application/publication/publication.pipeline";
import { SignalService } from "./application/services/signal.service";
import { SignalBackfillService } from "./application/services/signal-backfill.service";
import { SignalReadService } from "./application/read/signal-read.service";
import { SignalRepository } from "./infrastructure/repository/signal.repository";
import { SignalController } from "./signal.controller";
import { SignalGateway } from "./infrastructure/signal.gateway";

/**
 * THE SIGNAL ENGINE — the publisher. The Editor-in-Chief.
 *
 * Everything before this module produced evidence. This one decides which of it
 * is worth interrupting a trader for, and it is the only module allowed to publish
 * a Signal — the platform's single output (AGENTS.md §1).
 *
 * ── It orchestrates; it never analyses ──
 *
 * It imports IndicatorModule for exactly one thing — `timeframeMs`, to reason about
 * bar ages and windows. It does NOT compute an indicator, re-detect a pattern,
 * re-run the risk gates or re-score confidence. Every number in a published signal
 * was produced by the engine that owns it; this module reads those numbers, weighs
 * them against each other, and selects. Confluence (agreement) is the one measure
 * it computes itself, and even that is a reading of already-computed evidence, not
 * a fresh look at the market.
 *
 * ── Silence is the default ──
 *
 * Most candidates never become signals, and most days should be quiet. What the
 * module guarantees is not volume — it is that every publication and every
 * suppression can say exactly why, so a quiet day is auditable rather than
 * suspicious.
 */
@Module({
  imports: [PrismaModule, IndicatorModule, ConfidenceModule],
  controllers: [SignalController],
  providers: [
    ConfluenceEngine,
    RankingEngine,
    FreshnessService,
    DeduplicationService,
    PrimeBudgetManager,
    LifecycleManager,
    SignalBuilder,
    PublicationPipeline,
    SignalRepository,
    SignalService,
    SignalBackfillService,
    SignalReadService,
    SignalGateway,
  ],
  exports: [SignalService, SignalBackfillService, SignalRepository],
})
export class SignalModule {}
