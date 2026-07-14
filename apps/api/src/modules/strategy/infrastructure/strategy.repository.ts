import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  BUILT_IN_STRATEGIES,
  needsDerivativesFeed,
  rulesHash,
  strategyDefinitionSchema,
  type StrategyDefinition,
} from "@aegis/contracts";

/**
 * Where strategy documents live.
 *
 * In memory, seeded from `packages/contracts` — the **same six documents the frontend
 * renders**. Not a copy of them: the same objects, from the same file. Two copies of
 * the six strategies would be two sources of truth for one concept (AGENTS.md §2), and
 * they *would* drift — somebody edits a condition in one place and the platform
 * quietly evaluates a strategy that is not the one the user is reading.
 *
 * ── Why in-memory, when we have Postgres running ──
 *
 * The brief itself says "future database-backed storage", and the honest reason is
 * that a database only becomes the owner of these documents once a user can WRITE one
 * through the API — which needs authentication, strategy CRUD endpoints, and the
 * frontend's local store rewired to fetch. That is Milestone 11 (Users), and pulling
 * it forward would drag a whole authorisation surface into an engine milestone.
 *
 * Everything below is written against an interface that a Prisma implementation
 * satisfies without the evaluator noticing. `load()` is the only method that would
 * change.
 */
@Injectable()
export class StrategyRepository implements OnModuleInit {
  private readonly logger = new Logger(StrategyRepository.name);

  private strategies = new Map<string, StrategyDefinition>();

  constructor(private readonly events: EventEmitter2) {}

  onModuleInit(): void {
    this.load();
  }

  /**
   * Load and VALIDATE every document.
   *
   * ── A malformed strategy must never reach the evaluator ──
   *
   * The evaluator interprets documents. It trusts that what it is given is a document.
   * If a strategy with a missing operand, or a target that closes 140% of the position,
   * got past this point, the failure would surface deep inside an evaluation — on a
   * live market, in a worker, with an error message about an undefined property.
   *
   * So it is validated here, once, at the boundary. A strategy that fails is **dropped
   * loudly**, not repaired: a half-fixed trading rule is worse than no rule, because it
   * looks valid, renders plausibly, and means something its author never intended.
   */
  load(): void {
    const loaded = new Map<string, StrategyDefinition>();

    for (const raw of BUILT_IN_STRATEGIES) {
      const parsed = strategyDefinitionSchema.safeParse(raw);

      if (!parsed.success) {
        this.events.emit("strategy.invalid", {
          strategyId: (raw as { id?: string }).id ?? "unknown",
          issues: parsed.error.issues.map((i) => i.message),
        });

        this.logger.error(
          {
            strategy: (raw as { id?: string }).id,
            issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          },
          "A strategy document is INVALID and was not loaded — it will never be evaluated",
        );

        continue;
      }

      const strategy = parsed.data;

      /*
       * The hash is recomputed rather than trusted.
       *
       * A stale hash would quietly let an edited strategy keep a track record it did
       * not earn — which is the fabricated confidence this platform exists to refuse.
       * It costs microseconds to be certain.
       */
      const stamped: StrategyDefinition = {
        ...strategy,
        rulesHash: rulesHash(strategy),
      };

      loaded.set(stamped.id, stamped);

      this.events.emit("strategy.loaded", {
        strategyId: stamped.id,
        version: stamped.version,
        rulesHash: stamped.rulesHash,
      });
    }

    this.strategies = loaded;

    const blocked = [...loaded.values()].filter(needsDerivativesFeed);

    this.logger.log(
      {
        loaded: loaded.size,
        enabled: [...loaded.values()].filter((s) => s.enabled).length,
        blockedOnDerivatives: blocked.map((s) => s.id),
      },
      "Strategy documents loaded",
    );
  }

  /**
   * Hot reload.
   *
   * Rebuilds the whole map and swaps it in one assignment. **Never mutates the live
   * map in place**, so an evaluation running concurrently cannot see a half-reloaded
   * world — a strategy that exists for one rule and not the next.
   *
   * The reference swap is atomic in Node's single-threaded model, so no lock is
   * needed and none is faked.
   */
  reload(): void {
    this.load();
    this.events.emit("strategy.reloaded", { count: this.strategies.size });
  }

  get(id: string): StrategyDefinition | undefined {
    return this.strategies.get(id);
  }

  all(): StrategyDefinition[] {
    return [...this.strategies.values()];
  }

  /**
   * The strategies that may actually run right now.
   *
   * Disabled ones are excluded, and so are the ones whose data feed does not exist.
   * Crowd Squeeze needs funding rate and open interest; the platform has neither, so
   * evaluating it would fail every single time on an UNAVAILABLE condition and bury the
   * real rejections in noise. Standing it down is honest, and the health metrics say so
   * explicitly rather than through a mysteriously zero pass rate.
   */
  runnable(): StrategyDefinition[] {
    return this.all().filter(
      (strategy) => strategy.enabled && !needsDerivativesFeed(strategy),
    );
  }

  /** Why a strategy is not running. The Administration console asks this. */
  standDownReason(strategy: StrategyDefinition): string | null {
    if (!strategy.enabled) return "disabled";

    if (needsDerivativesFeed(strategy)) {
      return "needs the derivatives feed (funding rate / open interest), which the platform does not have";
    }

    return null;
  }
}
