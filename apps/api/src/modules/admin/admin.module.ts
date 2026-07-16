import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { BullModule } from "@nestjs/bullmq";
import { AppConfigModule } from "../../config/config.module";
import { QUEUE } from "../../core/queue/queue.constants";
import { MarketModule } from "../market/market.module";
import { SignalModule } from "../signals/signal.module";
import { ConfidenceModule } from "../confidence/confidence.module";
import { LedgerModule } from "../ledger/ledger.module";
import { InsightsModule } from "../insights/insights.module";
import { NotificationModule } from "../notifications/notification.module";
import { AdminController } from "./admin.controller";
import { MetricsController } from "./metrics.controller";
import { AdminService } from "./application/admin.service";
import { AuditService } from "./application/audit/audit.service";
import { FeatureFlagsService } from "./application/configuration/feature-flags.service";
import { MaintenanceService } from "./application/maintenance/maintenance.service";
import { SystemHealthService } from "./application/health/system-health.service";
import { PrometheusService } from "./application/metrics/prometheus.service";
import { AdminGuard } from "./infrastructure/admin.guard";
import { MaintenanceGuard } from "./infrastructure/maintenance.guard";
import { MetricsInterceptor } from "./infrastructure/metrics.interceptor";

/**
 * Administration & Observability — the operator's view over everything else.
 *
 * This module sits ABOVE the pipeline and reads from it; the pipeline never reads
 * back. It imports the intelligence modules only to borrow their public
 * `metrics()`/`health()` — it injects no repositories, touches no scores, and holds
 * no trading logic of its own. The dependency arrow points the right way: admin knows
 * about signals; signals know nothing about admin.
 *
 * Two guards ship from here, one of them global:
 *   - `MaintenanceGuard` is registered as an APP_GUARD so it fences EVERY route at
 *     once — the only correct scope for "the platform is down for work". It waves
 *     through health, metrics and the admin API so an operator can always climb back
 *     out.
 *   - `AdminGuard` is applied per-controller (on `AdminController`), because only the
 *     operator's console needs the token; the public API does not.
 */
@Module({
  imports: [
    AppConfigModule,
    MarketModule,
    SignalModule,
    ConfidenceModule,
    LedgerModule,
    InsightsModule,
    NotificationModule,
    /* The same queues the rest of the platform runs — registered here only to read
     * their depth. Registration is idempotent across modules. */
    ...Object.values(QUEUE).map((name) => BullModule.registerQueue({ name })),
  ],
  controllers: [AdminController, MetricsController],
  providers: [
    AdminService,
    AuditService,
    FeatureFlagsService,
    MaintenanceService,
    SystemHealthService,
    PrometheusService,
    AdminGuard,
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [FeatureFlagsService, AuditService, MaintenanceService],
})
export class AdminModule {}
