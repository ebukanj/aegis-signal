import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InsightsService } from "../services/insights.service";

/**
 * The heartbeat that keeps the world in view.
 *
 * News does not wait for a page load. This worker collects on a timer so the feed,
 * and the Risk Flags derived from it, are current — a coin exploited five minutes
 * ago should already be flagged when the next signal on it is evaluated, not when
 * someone happens to refresh.
 *
 * It runs one pass on boot (so the platform is never blank after a restart) and
 * every few minutes after. The interval is minutes, not seconds: news is not
 * price, the feeds update on the order of minutes, and hammering four outlets every
 * second would earn a rate-limit and teach the collectors nothing new.
 */
@Injectable()
export class CollectionWorker implements OnModuleInit {
  private readonly logger = new Logger(CollectionWorker.name);
  private running = false;

  constructor(private readonly insights: InsightsService) {}

  async onModuleInit(): Promise<void> {
    /* One pass on boot, in the background — never block startup on a slow feed. */
    void this.sweep();
  }

  @Interval(300_000) // every 5 minutes
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.insights.collect();
    } catch (error) {
      this.logger.error({ err: error }, "Insight collection failed");
    } finally {
      this.running = false;
    }
  }
}
