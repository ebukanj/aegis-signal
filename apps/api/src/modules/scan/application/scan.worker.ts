import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";

import { AppConfigService } from "../../../config/app-config.service";
import { ScanService } from "./scan.service";

/**
 * The heartbeat that makes the platform LIVE.
 *
 * The Settlement Worker takes signals OUT of the feed when the market resolves
 * them; this worker puts real ones IN. On a fixed interval it runs a full scan of
 * the universe and publishes whatever passed — so the feed is a live view of the
 * market right now, not a snapshot someone seeded. When no setup qualifies, it
 * publishes nothing, and the feed is honestly empty (AGENTS.md §1).
 *
 * The interval is configurable and the whole worker is a runtime kill switch
 * (`SCAN_ENABLED`): a deploy that consumes signals from elsewhere turns it off,
 * and the rest of the platform is unaffected.
 */
@Injectable()
export class ScanWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScanWorker.name);
  private static readonly INTERVAL_NAME = "live-scan";
  /** A short delay so exchanges have connected and the symbol registry is populated. */
  private static readonly WARMUP_MS = 15_000;

  private running = false;

  constructor(
    private readonly scan: ScanService,
    private readonly config: AppConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.scan.enabled) {
      this.logger.warn("Live scan is DISABLED (SCAN_ENABLED=false) — the feed will not self-populate");
      return;
    }

    const { intervalMs } = this.config.scan;

    // Warm up, then sweep on the configured interval. The first sweep waits for the
    // exchanges to connect so it is not scanning an empty registry.
    setTimeout(() => void this.tick(), ScanWorker.WARMUP_MS);

    const interval = setInterval(() => void this.tick(), intervalMs);
    this.scheduler.addInterval(ScanWorker.INTERVAL_NAME, interval);

    this.logger.log(`Live scan armed — sweeping every ${Math.round(intervalMs / 1000)}s`);
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist("interval", ScanWorker.INTERVAL_NAME)) {
      this.scheduler.deleteInterval(ScanWorker.INTERVAL_NAME);
    }
  }

  /** One sweep. Never overlaps — a slow sweep must not stack on the next tick. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scan.sweep();
    } catch (error) {
      // A sweep that throws must never kill the worker — the platform stays live
      // through any single failure and tries again next tick.
      this.logger.error({ err: error }, "Scan sweep failed — the worker survives and retries");
    } finally {
      this.running = false;
    }
  }
}
