import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  Candle,
  EvaluationResult,
  StrategyDefinition,
  Timeframe,
} from "@aegis/contracts";
import { IndicatorService } from "../../../indicators/application/services/indicator.service";
import { PatternService } from "../../../patterns/application/services/pattern.service";
import { RegimeService } from "../../../regime/application/services/regime.service";
import { StrategyRepository } from "../../infrastructure/strategy.repository";
import { DependencyResolver } from "../resolver/dependency.resolver";
import { StrategyEvaluator } from "../executor/strategy.evaluator";
import type { EvaluationContext } from "../../domain/evaluation-context";
import type { Maybe } from "../../../indicators/application/math/rolling";

/**
 * The Strategy Evaluator's front door.
 *
 * The pipeline the milestone specifies, in order:
 *
 *   document → VALIDATE → resolve dependencies → assemble context (frozen)
 *            → regime gate → rules → candidate → explanation → publish
 *
 * Validation happened in the repository, at load. Everything below assumes it is
 * holding a real document, because it is.
 */
@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  private evaluations = 0;
  private candidates = 0;
  private rejections = 0;
  private failures = 0;
  private totalLatencyMs = 0;

  /** Why strategies are going quiet. The single most useful operational metric here. */
  private readonly rejectionReasons = new Map<string, number>();

  constructor(
    private readonly repository: StrategyRepository,
    private readonly resolver: DependencyResolver,
    private readonly evaluator: StrategyEvaluator,
    private readonly indicators: IndicatorService,
    private readonly patterns: PatternService,
    private readonly regime: RegimeService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Every runnable strategy, against one symbol.
   *
   * `allSettled`: one strategy blowing up must not stop the other five. A document with
   * a rule the engines cannot answer is a broken document, not a broken platform.
   */
  async evaluateAll(input: {
    symbol: string;
    exchange: string;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
  }): Promise<EvaluationResult[]> {
    const strategies = this.repository.runnable();

    const results = await Promise.allSettled(
      strategies.map((strategy) => this.evaluate({ ...input, strategy })),
    );

    const out: EvaluationResult[] = [];

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        out.push(result.value);
        return;
      }

      this.failures++;

      this.logger.error(
        { strategy: strategies[i].id, symbol: input.symbol, err: result.reason },
        "A strategy evaluation THREW — the others continue",
      );
    });

    return out;
  }

  /** One strategy, one symbol, one closed bar. */
  async evaluate(input: {
    strategy: StrategyDefinition;
    symbol: string;
    exchange: string;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
  }): Promise<EvaluationResult> {
    const started = Date.now();
    const { strategy, symbol } = input;

    const context = await this.assemble(input);

    const result = this.evaluator.evaluate(strategy, context);

    this.evaluations++;
    this.totalLatencyMs += Date.now() - started;

    if (result.kind === "candidate") {
      this.candidates++;

      this.events.emit("strategy.candidate", {
        strategyId: strategy.id,
        symbol,
        direction: result.candidate.direction,
        barTime: result.candidate.barTime,
        candidateId: result.candidate.id,
      });

      this.logger.log(
        {
          strategy: strategy.id,
          symbol,
          direction: result.candidate.direction,
          regime: context.regime,
        },
        "CANDIDATE — every rule in the document is satisfied",
      );
    } else {
      this.rejections++;

      /*
       * The rejection reason is COUNTED, not merely logged.
       *
       * A strategy that has been silent for a fortnight is either working perfectly or
       * quietly broken, and only this tells an operator which. If 100% of Level Bounce's
       * rejections say "no order block", the strategy is fine and the market is not
       * offering. If they say "could not evaluate cvd", the platform is blind and
       * nobody would otherwise know.
       */
      const key = `${strategy.id}: ${normalise(result.reason)}`;
      this.rejectionReasons.set(key, (this.rejectionReasons.get(key) ?? 0) + 1);

      this.events.emit("strategy.rejected", {
        strategyId: strategy.id,
        symbol,
        reason: result.reason,
      });
    }

    return result;
  }

  /* ── Context assembly ────────────────────────────────────────────── */

  /**
   * Resolve every dependency the document names, in PARALLEL, and freeze the result.
   *
   * The engines are asked for what they own. **Nothing is computed here** — not an
   * indicator, not a pattern, not a regime. That boundary is what keeps the arithmetic
   * in exactly one place per concept (AGENTS.md §2), and it is why the evaluator can be
   * a pure function of its context.
   */
  private async assemble(input: {
    strategy: StrategyDefinition;
    symbol: string;
    exchange: string;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
  }): Promise<EvaluationContext> {
    const { strategy, symbol, candlesByTimeframe } = input;

    const dependencies = this.resolver.resolve(strategy);

    const missing = dependencies.timeframes.filter(
      (tf) => !candlesByTimeframe[tf]?.length,
    );

    if (missing.length > 0) {
      /*
       * A strategy asking for a timeframe we do not have is not a strategy that fails
       * its conditions — it is one that cannot be asked. Throwing is right: the caller
       * gave us an incomplete world, and quietly evaluating the rules we *can* reach
       * would produce a verdict on a document we only half-read.
       */
      throw new Error(
        `${strategy.id} needs ${missing.join(", ")} candles for ${symbol}, and none were supplied`,
      );
    }

    const candles = Object.fromEntries(
      dependencies.timeframes.map((tf) => [tf, candlesByTimeframe[tf]!]),
    );

    /* All three engines, at once. They do not depend on each other. */
    const [indicatorResults, patternResults, market] = await Promise.all([
      this.resolveIndicators(symbol, dependencies, candles),
      this.resolvePatterns(symbol, dependencies, candles),
      this.regime.context({
        symbol,
        primary: strategy.timeframe,
        candlesByTimeframe,
      }),
    ]);

    const bar = candles[strategy.timeframe]!.at(-1)!;

    return Object.freeze({
      symbol,
      exchange: input.exchange,
      timeframe: strategy.timeframe,
      candles,
      indicators: indicatorResults,
      patterns: patternResults,
      market,
      regime: market.timeframes[strategy.timeframe]!.direction,
      bar,
    });
  }

  private async resolveIndicators(
    symbol: string,
    dependencies: ReturnType<DependencyResolver["resolve"]>,
    candles: Record<string, readonly Candle[]>,
  ): Promise<Record<string, readonly Maybe[]>> {
    const out: Record<string, readonly Maybe[]> = {};

    // Grouped by timeframe so the Indicator Engine can batch each set in one call.
    const byTimeframe = new Map<Timeframe, typeof dependencies.indicators>();

    for (const dependency of dependencies.indicators) {
      const list = byTimeframe.get(dependency.timeframe) ?? [];
      list.push(dependency);
      byTimeframe.set(dependency.timeframe, list);
    }

    await Promise.all(
      [...byTimeframe.entries()].map(async ([timeframe, wanted]) => {
        const { series, failed } = await this.indicators.calculateMany({
          symbol,
          candles: candles[timeframe]!,
          timeframe,
          requests: wanted.map((w) => ({
            indicator: w.indicator as never,
            params: w.params as never,
          })),
        });

        for (const [key, value] of Object.entries(series)) {
          out[key] = value.values.map((v) => v.value);
        }

        /*
         * A failed indicator is NOT written as an empty series.
         *
         * It is simply absent, so the executor reports the condition UNAVAILABLE rather
         * than FAILED. An empty array would be read as "computed, and never true" — and
         * the strategy would look like it was being rejected by the market when it was
         * actually being rejected by a missing EMA.
         */
        if (Object.keys(failed).length > 0) {
          this.logger.warn(
            { symbol, timeframe, failed },
            "Indicators a strategy asked for could not be computed — its conditions will report UNAVAILABLE",
          );
        }
      }),
    );

    return out;
  }

  private async resolvePatterns(
    symbol: string,
    dependencies: ReturnType<DependencyResolver["resolve"]>,
    candles: Record<string, readonly Candle[]>,
  ) {
    if (!dependencies.needsPatterns) return {};

    const entries = await Promise.all(
      dependencies.timeframes.map(async (timeframe) => {
        const set = await this.patterns.detect({
          symbol,
          candles: candles[timeframe]!,
          timeframe,
        });

        return [timeframe, set.patterns] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  /* ── Health ──────────────────────────────────────────────────────── */

  metrics() {
    const total = this.candidates + this.rejections;

    return {
      evaluations: this.evaluations,
      candidates: this.candidates,
      rejections: this.rejections,
      failures: this.failures,

      /**
       * The pass rate — and it SHOULD be low.
       *
       * A strategy firing on a third of the bars it sees is not a good strategy, it is
       * a broken filter. "Say nothing at all when no such trade exists" is the product
       * (AGENTS.md §1), so a pass rate near zero is the expected shape of a healthy
       * platform, and a rising one is a warning rather than a win.
       */
      passRate: total === 0 ? 0 : this.candidates / total,

      averageLatencyMs:
        this.evaluations === 0 ? 0 : this.totalLatencyMs / this.evaluations,

      /** WHY strategies are quiet. The most useful line in the admin console. */
      topRejectionReasons: [...this.rejectionReasons.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([reason, count]) => ({ reason, count })),

      strategies: this.repository.all().map((strategy) => ({
        id: strategy.id,
        version: strategy.version,
        enabled: strategy.enabled,
        standDownReason: this.repository.standDownReason(strategy),
      })),
    };
  }
}

/** Collapse the numbers out of a reason so "RSI = 41.2" and "RSI = 38.7" group. */
function normalise(reason: string): string {
  return reason.replace(/-?\d+(\.\d+)?/g, "N").slice(0, 120);
}
