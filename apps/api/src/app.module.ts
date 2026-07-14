import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppConfigModule } from "./config/config.module";
import { AppConfigService } from "./config/app-config.service";
import { LoggingModule } from "./core/logging/logging.module";
import { PrismaModule } from "./core/database/prisma.module";
import { RedisModule } from "./core/cache/redis.module";
import { QueueModule } from "./core/queue/queue.module";
import { EventsModule } from "./core/events/events.module";
import { HealthModule } from "./health/health.module";
import { MarketModule } from "./modules/market/market.module";

/**
 * The application.
 *
 * Everything below `core/` is infrastructure — it knows nothing about trading.
 * The intelligence modules that arrive in later milestones will sit in
 * `modules/`, and they will depend on these; **these will never depend on them**.
 * Dependencies point inward (Philosophy 3), and this file is where that is
 * either honoured or quietly broken.
 *
 * The pipeline it will eventually host is immutable (AGENTS.md §5):
 *
 *   Market → Condition → Strategy → RISK → Confidence → Confluence → Prime → Signal
 *
 * **Nothing may skip the Risk Engine.** When a module is added here, that is the
 * sentence to re-read.
 */
@Module({
  imports: [
    /* Configuration first: everything else depends on a validated environment. */
    AppConfigModule,
    LoggingModule,

    /* Infrastructure. */
    PrismaModule,
    RedisModule,
    QueueModule,
    EventsModule,
    ScheduleModule.forRoot(),

    /*
     * Rate limiting.
     *
     * A public signal API is a scraping target. Without this, one client can
     * exhaust the exchange rate limits the whole platform shares — and then
     * nobody gets market data.
     */
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: 60_000,
          limit: config.security.rateLimitPerMinute,
        },
      ],
    }),

    HealthModule,

    /*
     * The pipeline, in order. Market is the heartbeat — everything downstream
     * assumes its data is accurate, timely and normalized.
     */
    MarketModule,

    /*
     * Still to come, in pipeline order:
     *   IndicatorModule, PatternModule, ConditionModule, StrategyModule,
     *   RiskModule, ConfidenceModule, SignalModule, CalibrationModule,
     *   LedgerModule, InsightModule, NotificationModule
     * See docs/07-BACKEND_REQUIREMENTS.md.
     *
     * NOTHING MAY SKIP THE RISK ENGINE. When a module is added here, that is
     * the sentence to re-read.
     */
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
