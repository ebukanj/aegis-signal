import { Module } from "@nestjs/common";

import { PrismaModule } from "../../core/database/prisma.module";

import { EntityExtractor } from "./application/enrichment/entity.extractor";
import { ClassificationEngine } from "./application/classifiers/classification.engine";
import { CollectorRegistry } from "./application/collectors/collector.registry";
import { CollectionWorker } from "./application/collectors/collection.worker";
import { NormalizationPipeline } from "./application/services/normalization.pipeline";
import { DeduplicationEngine } from "./application/deduplication/deduplication.engine";
import { RiskFlagGenerator } from "./application/risk-flags/risk-flag.generator";
import { InsightsService } from "./application/services/insights.service";
import { InsightsReadService } from "./application/read/insights-read.service";
import { SocialCollector } from "./application/social/social.collector";
import { InsightRepository } from "./infrastructure/repository/insight.repository";
import { InsightsController } from "./insights.controller";

/**
 * THE INSIGHTS ENGINE — the eyes and ears of the platform.
 *
 * The other engines analyse the market itself; this analyses the world around it.
 * It collects news from real sources, normalizes everything into one canonical
 * shape, classifies it DETERMINISTICALLY (rules you can read, not a model you
 * cannot), deduplicates so a story counts once, and derives the Risk Flags that
 * corroborated danger implies.
 *
 * ── What it is forbidden to do ──
 *
 * It never creates, rejects, or modifies a trading signal. It never adjusts
 * confidence, never sets leverage, never predicts a price. It provides awareness —
 * and, when two independent sources agree that a coin has been exploited, hacked,
 * delisted or depegged, a VETO the Risk Engine may honour (ADR-023 §5). Context,
 * and a stop. Nothing between.
 */
@Module({
  imports: [PrismaModule],
  controllers: [InsightsController],
  providers: [
    SocialCollector,
    EntityExtractor,
    ClassificationEngine,
    CollectorRegistry,
    NormalizationPipeline,
    DeduplicationEngine,
    RiskFlagGenerator,
    InsightRepository,
    InsightsService,
    InsightsReadService,
    CollectionWorker,
  ],
  exports: [InsightsService],
})
export class InsightsModule {}
