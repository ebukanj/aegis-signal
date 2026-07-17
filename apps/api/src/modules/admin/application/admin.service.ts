import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type {
  AdminOverviewDto,
  ExchangeStatusDto,
  HealthLevel,
  ModuleStatusDto,
  QueueStatusDto,
} from "@aegis/contracts";
import { AppConfigService } from "../../../config/app-config.service";
import { QUEUE } from "../../../core/queue/queue.constants";
import { MarketService } from "../../market/application/market.service";
import { SymbolRegistry } from "../../market/domain/symbol-registry";
import { SignalService } from "../../signals/application/services/signal.service";
import { ConfidenceService } from "../../confidence/application/services/confidence.service";
import { LedgerService } from "../../ledger/application/services/ledger.service";
import { InsightsService } from "../../insights/application/services/insights.service";
import { NotificationReadService } from "../../notifications/application/read/notification-read.service";
import { SystemHealthService } from "./health/system-health.service";
import { FeatureFlagsService } from "./configuration/feature-flags.service";
import { MaintenanceService } from "./maintenance/maintenance.service";

/**
 * The one place that sees the whole platform at once.
 *
 * Admin does not own any of these numbers — it BORROWS them. Every module already
 * computes its own metrics and its own health; the admin service's only job is to
 * gather them onto one screen without ever recomputing or second-guessing them. That
 * is why each module's numbers arrive through its own public `metrics()`/`health()`
 * and are passed through untouched: the dashboard shows exactly what the module
 * believes about itself, not a parallel truth admin invented.
 *
 * ── Fault isolation is the whole point ──
 *
 * A monitoring surface that dies when one thing it monitors dies is worse than
 * useless — it goes dark exactly when you need it most. So every module read is
 * wrapped: if the insights service throws while the dashboard is loading, the
 * dashboard still renders, with insights marked CRITICAL and the rest intact. The
 * admin view degrades one tile at a time, never all at once.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly startedAt = Date.now();

  private readonly queues: { name: string; queue: Queue }[];

  constructor(
    private readonly config: AppConfigService,
    private readonly system: SystemHealthService,
    private readonly flags: FeatureFlagsService,
    private readonly maintenance: MaintenanceService,
    private readonly market: MarketService,
    private readonly registry: SymbolRegistry,
    private readonly signals: SignalService,
    private readonly confidence: ConfidenceService,
    private readonly ledger: LedgerService,
    private readonly insights: InsightsService,
    private readonly notifications: NotificationReadService,
    @InjectQueue(QUEUE.MARKET) marketQueue: Queue,
    @InjectQueue(QUEUE.STRATEGY) strategyQueue: Queue,
    @InjectQueue(QUEUE.RISK) riskQueue: Queue,
    @InjectQueue(QUEUE.SIGNAL) signalQueue: Queue,
    @InjectQueue(QUEUE.NOTIFICATION) notificationQueue: Queue,
    @InjectQueue(QUEUE.CALIBRATION) calibrationQueue: Queue,
    @InjectQueue(QUEUE.DEAD_LETTER) deadLetterQueue: Queue,
  ) {
    this.queues = [
      { name: QUEUE.MARKET, queue: marketQueue },
      { name: QUEUE.STRATEGY, queue: strategyQueue },
      { name: QUEUE.RISK, queue: riskQueue },
      { name: QUEUE.SIGNAL, queue: signalQueue },
      { name: QUEUE.NOTIFICATION, queue: notificationQueue },
      { name: QUEUE.CALIBRATION, queue: calibrationQueue },
      { name: QUEUE.DEAD_LETTER, queue: deadLetterQueue },
    ];
  }

  /** The whole platform, on one screen. Every section is fault-isolated. */
  async overview(): Promise<AdminOverviewDto> {
    const [exchanges, queues, modules] = await Promise.all([
      this.exchangeStatus(),
      this.queueStatus(),
      this.moduleStatus(),
    ]);

    return {
      build: {
        service: "aegis-api",
        version: process.env.npm_package_version ?? "0.1.0",
        commit: process.env.GIT_COMMIT ?? "unknown",
        environment: this.config.env,
        nodeVersion: process.version,
        startedAt: this.startedAt,
      },
      system: this.system.snapshot(),
      maintenance: this.maintenance.current(),
      exchanges,
      queues,
      modules,
      flags: this.flags.all(),
      generatedAt: Date.now(),
    };
  }

  /**
   * A flat bag of business gauges for Prometheus. Kept numeric and shallow on
   * purpose — the exposition format has no place for nested objects, so we lift only
   * the handful of scalars worth graphing.
   */
  async gauges(): Promise<Record<string, number>> {
    const bag: Record<string, number> = {};
    const modules = await this.moduleStatus();
    for (const m of modules) {
      for (const [key, value] of Object.entries(m.metrics)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          bag[`${m.module}_${toSnake(key)}`] = value;
        }
      }
    }
    const sys = this.system.snapshot();
    bag.event_loop_lag_ms = sys.eventLoop.meanLagMs;
    bag.memory_system_used_percent = sys.memory.systemUsedPercent;
    return bag;
  }

  private async exchangeStatus(): Promise<ExchangeStatusDto[]> {
    return this.guard("exchanges", [], () =>
      this.market.health().map((h) => ({
        exchange: h.exchange,
        connected: h.connected,
        latencyMs: h.latencyMs,
        errorRate: h.errorRate,
        circuitOpen: h.circuitOpen,
        activeSubscriptions: h.activeSubscriptions,
        // What the exchange actually LISTS — the number an operator means by
        // "markets". Subscriptions are a streaming detail (zero for REST-polled
        // Bybit) and were being misread as an empty exchange.
        listedMarkets: this.registry.marketsOn(h.exchange).length,
      })),
    );
  }

  private async queueStatus(): Promise<QueueStatusDto[]> {
    return Promise.all(
      this.queues.map(async ({ name, queue }) => {
        try {
          const counts = await queue.getJobCounts(
            "waiting",
            "active",
            "completed",
            "failed",
            "delayed",
          );
          const paused = await queue.isPaused();
          return {
            name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
            paused,
          };
        } catch (error) {
          /* Redis is flaky here by nature (a cloud plaintext instance); a queue we
           * cannot reach reports zeros rather than sinking the whole dashboard. */
          this.logger.warn(`Queue ${name} unreadable: ${(error as Error).message}`);
          return { name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false };
        }
      }),
    );
  }

  private async moduleStatus(): Promise<ModuleStatusDto[]> {
    const [signals, confidence, ledger, insights, notifications] = await Promise.all([
      this.guardModule("signals", () => this.signals.metrics()),
      this.guardModule("confidence", () => this.confidence.metrics()),
      this.guardModule("ledger", () => this.ledger.metrics()),
      this.guardModule("insights", () => this.insights.metrics()),
      this.guardModule("notifications", () => this.notifications.metrics()),
    ]);

    /* Insights is the one module that reports its own collector health, so its status
     * reflects that rather than merely "did metrics() throw". */
    const insightsHealth = this.guard<HealthLevel>("insights-health", "WARNING", () => {
      const report = this.insights.health();
      if (report.length === 0) return "HEALTHY";
      return report.some((h) => h.status !== "HEALTHY") ? "WARNING" : "HEALTHY";
    });

    return [
      signals,
      confidence,
      ledger,
      { ...insights, status: insights.status === "CRITICAL" ? "CRITICAL" : await insightsHealth },
      notifications,
    ];
  }

  /** Run a module's `metrics()` and wrap the result, or degrade it to CRITICAL. */
  private async guardModule(
    name: string,
    read: () => Promise<Record<string, unknown>>,
  ): Promise<ModuleStatusDto> {
    try {
      const metrics = await read();
      return { module: name, status: "HEALTHY", note: null, metrics };
    } catch (error) {
      this.logger.error(`Module ${name} status read failed: ${(error as Error).message}`);
      return {
        module: name,
        status: "CRITICAL",
        note: `metrics unavailable: ${(error as Error).message}`,
        metrics: {},
      };
    }
  }

  private async guard<T>(label: string, fallback: T, read: () => T | Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      this.logger.warn(`Admin read '${label}' failed: ${(error as Error).message}`);
      return fallback;
    }
  }
}

function toSnake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
