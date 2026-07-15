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
import { IndicatorModule } from "./modules/indicators/indicator.module";
import { PatternModule } from "./modules/patterns/pattern.module";
import { RegimeModule } from "./modules/regime/regime.module";
import { StrategyModule } from "./modules/strategy/strategy.module";
import { RiskModule } from "./modules/risk/risk.module";
import { ConfidenceModule } from "./modules/confidence/confidence.module";
import { SignalModule } from "./modules/signals/signal.module";
import { LedgerModule } from "./modules/ledger/ledger.module";
import { InsightsModule } from "./modules/insights/insights.module";
import { NotificationModule } from "./modules/notifications/notification.module";

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
     * Indicators turn those candles into numbers. They provide evidence; they
     * never make decisions — nothing in here knows what a strategy or a signal
     * is, and that boundary is what makes every layer above it auditable.
     */
    IndicatorModule,

    /*
     * Patterns interpret what the indicators measure. Indicators say "RSI is 28.3";
     * patterns say "price swept the lows and reclaimed". The second cannot be
     * expressed as an indicator comparison, which is why this module exists.
     */
    PatternModule,

    /*
     * The regime is CONTEXT, not an indicator. It says what environment the market
     * is in — and no strategy should ever be evaluated without knowing, because a
     * rule that prints money in a trend gets shredded in a range.
     */
    RegimeModule,

    /*
     * The document interpreter. Every strategy — built-in or user-invented — is a
     * document, and this is the ONE thing that reads it (ADR-023). It produces
     * candidates: trading intent, and the weakest opinion the platform holds.
     *
     * NOTHING MAY SKIP THE RISK ENGINE. A candidate is not a signal.
     */
    StrategyModule,

    /*
     * THE VETO. Nothing reaches a trader that this engine did not check, and if it says
     * no, the platform says no. Its power to refuse is not an obstacle to the product —
     * it IS the product.
     */
    RiskModule,
    ConfidenceModule,
    SignalModule,
    LedgerModule,
    InsightsModule,
    NotificationModule,

    /*
     * Still to come, in pipeline order:
     *   ConditionModule, StrategyModule, RiskModule,
     *   ConfidenceModule, SignalModule, CalibrationModule, LedgerModule,
     *   InsightModule, NotificationModule
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
