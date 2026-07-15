import { Injectable, Logger } from "@nestjs/common";
import type { CollectorHealth } from "@aegis/contracts";
import type { IInsightCollector, RawItem } from "../../domain/collector";
import { RssCollector, NEWS_FEEDS } from "../../infrastructure/rss/rss.collector";

export interface CollectedBatch {
  collector: IInsightCollector;
  items: RawItem[];
}

/**
 * The collectors, and their health.
 *
 * ── Independence is the whole design ──
 *
 * Collectors are run with `allSettled`, never `all`. One outlet changing its feed
 * URL, rate-limiting the scraper, or serving malformed XML must NEVER stop the
 * others — a single dead source cannot be allowed to blind the platform. A failure
 * is caught, recorded against that collector's health, and the pipeline proceeds
 * with what the healthy sources returned.
 *
 * ── A dead collector announces itself ──
 *
 * The worst failure a feed can have is to go quiet: no error, just nothing, which
 * looks exactly like a calm news day until a trader misses the story that mattered.
 * So health is tracked per collector — last success, last error, consecutive
 * failures — and a source that has failed repeatedly is DEGRADED or DOWN, loudly,
 * on the admin surface.
 */
@Injectable()
export class CollectorRegistry {
  private readonly logger = new Logger(CollectorRegistry.name);

  private readonly collectors: IInsightCollector[];
  private readonly health = new Map<string, CollectorHealth>();

  constructor() {
    this.collectors = NEWS_FEEDS.map(
      (f) => new RssCollector(f.provider, f.source, f.tier, f.url),
    );

    for (const c of this.collectors) {
      this.health.set(c.provider, {
        provider: c.provider,
        status: "HEALTHY",
        lastSuccessAt: null,
        lastErrorAt: null,
        lastError: null,
        consecutiveFailures: 0,
        itemsLastRun: 0,
      });
    }
  }

  tierOf(provider: string): IInsightCollector["tier"] | null {
    return this.collectors.find((c) => c.provider === provider)?.tier ?? null;
  }

  /** Run every collector, independently, and return what the healthy ones produced. */
  async collectAll(now: number): Promise<CollectedBatch[]> {
    const results = await Promise.allSettled(
      this.collectors.map(async (collector) => ({
        collector,
        items: await collector.collect(),
      })),
    );

    const batches: CollectedBatch[] = [];

    results.forEach((result, i) => {
      const collector = this.collectors[i];

      if (result.status === "fulfilled") {
        batches.push(result.value);
        this.recordSuccess(collector.provider, result.value.items.length, now);
      } else {
        this.recordFailure(collector.provider, String(result.reason?.message ?? result.reason), now);
        this.logger.warn(`Collector ${collector.provider} failed: ${result.reason}`);
      }
    });

    return batches;
  }

  healthReport(): CollectorHealth[] {
    return [...this.health.values()];
  }

  private recordSuccess(provider: string, items: number, now: number): void {
    this.health.set(provider, {
      provider,
      status: "HEALTHY",
      lastSuccessAt: new Date(now).toISOString(),
      lastErrorAt: this.health.get(provider)?.lastErrorAt ?? null,
      lastError: this.health.get(provider)?.lastError ?? null,
      consecutiveFailures: 0,
      itemsLastRun: items,
    });
  }

  private recordFailure(provider: string, error: string, now: number): void {
    const prior = this.health.get(provider);
    const failures = (prior?.consecutiveFailures ?? 0) + 1;

    this.health.set(provider, {
      provider,
      /* One failure is a blip; three in a row is a source that needs attention. */
      status: failures >= 3 ? "DOWN" : "DEGRADED",
      lastSuccessAt: prior?.lastSuccessAt ?? null,
      lastErrorAt: new Date(now).toISOString(),
      lastError: error.slice(0, 200),
      consecutiveFailures: failures,
      itemsLastRun: 0,
    });
  }
}
