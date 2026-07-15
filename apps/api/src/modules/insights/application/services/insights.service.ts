import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { CollectorHealth, Insight, RiskFlag } from "@aegis/contracts";

import { CollectorRegistry } from "../collectors/collector.registry";
import { NormalizationPipeline } from "./normalization.pipeline";
import { DeduplicationEngine } from "../deduplication/deduplication.engine";
import { RiskFlagGenerator } from "../risk-flags/risk-flag.generator";
import { InsightRepository } from "../../infrastructure/repository/insight.repository";

/**
 * The Insights Engine's front door — the eyes and ears.
 *
 * It runs the pipeline the spec lays out end to end: collect from every source,
 * normalize into the one canonical shape, deduplicate so a story is counted once,
 * classify deterministically, persist, and derive the Risk Flags that corroborated
 * danger implies. Then it stops. It never rejects a signal, never adjusts a score,
 * never says "buy". It provides awareness, and — only when two sources agree on
 * danger — a veto.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  /* Active risk flags, held in memory for the Risk Engine to consult cheaply. The
   * durable record is the insights they derive from; a flag is a view over those. */
  private flags: RiskFlag[] = [];

  constructor(
    private readonly registry: CollectorRegistry,
    private readonly pipeline: NormalizationPipeline,
    private readonly deduplication: DeduplicationEngine,
    private readonly riskFlags: RiskFlagGenerator,
    private readonly repository: InsightRepository,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * One full collection pass. Safe to run on a timer — idempotent on the dedupe
   * key, so re-collecting the same news updates rather than duplicates.
   */
  async collect(now = Date.now()): Promise<{ collected: number; flags: number }> {
    const batches = await this.registry.collectAll(now);

    /* Normalize every raw item through the ONE pipeline. */
    const normalized: Insight[] = [];
    for (const batch of batches) {
      for (const raw of batch.items) {
        try {
          normalized.push(this.pipeline.normalize(batch.collector, raw, now));
        } catch (error) {
          /* A single malformed item must never lose the batch. */
          this.logger.debug(`Skipped an unparseable item from ${batch.collector.source}: ${(error as Error).message}`);
        }
      }
    }

    /* Merge the same story across outlets — this is what makes corroboration real. */
    const deduped = this.deduplication.dedupe(normalized);

    const { created, updated } = await this.repository.upsertMany(deduped);

    /* Recompute active flags from the corroborated, flag-worthy insights. */
    const fresh = this.riskFlags.generate(deduped);
    this.reconcileFlags(fresh, now);

    if (created > 0) {
      this.events.emit("insight.collected", { created, updated });
    }

    this.logger.log(
      `Collection pass: ${normalized.length} items → ${deduped.length} unique (${created} new, ${updated} updated) · ${this.flags.length} active flag(s)`,
    );

    return { collected: created, flags: this.flags.length };
  }

  /**
   * The active vetoes. The Risk Engine consults this — a coin with a flag here is
   * untouchable until the flag expires (ADR-023 §5). Deduplicated by (coin, kind).
   */
  activeRiskFlags(now = Date.now()): RiskFlag[] {
    return this.flags.filter((f) => this.riskFlags.isActive(f, now));
  }

  health(): CollectorHealth[] {
    return this.registry.healthReport();
  }

  async metrics(): Promise<Record<string, unknown>> {
    const now = Date.now();
    const total = await this.repository.count();
    const today = await this.repository.countSince(now - 86_400_000);
    const health = this.registry.healthReport();

    return {
      totalInsights: total,
      insightsToday: today,
      activeRiskFlags: this.activeRiskFlags(now).length,
      collectors: health.map((h) => ({ provider: h.provider, status: h.status, itemsLastRun: h.itemsLastRun })),
      healthy: health.filter((h) => h.status === "HEALTHY").length,
      degraded: health.filter((h) => h.status !== "HEALTHY").length,
    };
  }

  private reconcileFlags(fresh: RiskFlag[], now: number): void {
    /* Keep still-active existing flags plus any new ones, deduped by id. A flag
     * that was raised earlier and has not expired stays raised even if the story
     * has scrolled out of the latest batch — a hack does not un-happen because the
     * headline aged. */
    const byId = new Map<string, RiskFlag>();
    for (const flag of this.flags) {
      if (this.riskFlags.isActive(flag, now)) byId.set(flag.id, flag);
    }
    for (const flag of fresh) {
      if (!byId.has(flag.id)) {
        byId.set(flag.id, flag);
        this.events.emit("insight.risk-flag-raised", { coin: flag.coin, kind: flag.kind });
      }
    }
    this.flags = [...byId.values()];
  }
}
