import { Injectable, Logger } from "@nestjs/common";
import {
  indicatorKey,
  type Candle,
  type DetectedPattern,
  type EvidenceSnapshot,
  type Indicator,
  type StrategyDefinition,
  type Timeframe,
} from "@aegis/contracts";

import { IndicatorService } from "../../indicators/application/services/indicator.service";
import { IndicatorRegistry } from "../../indicators/application/registry/indicator.registry";
import type { Maybe } from "../../indicators/application/math/rolling";
import { PatternService } from "../../patterns/application/services/pattern.service";
import { RegimeService } from "../../regime/application/services/regime.service";
import { StrategyRepository } from "../../strategy/infrastructure/strategy.repository";
import { DependencyResolver } from "../../strategy/application/resolver/dependency.resolver";
import { StrategyEvaluator } from "../../strategy/application/executor/strategy.evaluator";
import { RiskService } from "../../risk/application/services/risk.service";
import { ConfidenceService } from "../../confidence/application/services/confidence.service";
import { MarketService } from "../../market/application/market.service";
import {
  DEFAULT_CONFIDENCE_POLICY,
  type ConfidencePolicy,
} from "../../confidence/confidence.policy";
import type { SignalCandidate } from "../../signals/domain/intake";

/**
 * The live pipeline for ONE symbol — the top of the intelligence pipeline that was
 * missing (M15).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SAME ENGINES, ON THE LATEST BAR, WITH LIVE INPUTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The Confidence Engine's ReplayRunner already proved this exact orchestration
 * against two years of history: assemble a symbol's world (indicators, patterns,
 * zones, regime) → evaluate each strategy → put every candidate through the Risk
 * Engine → score the survivors. This service does the identical thing, but for the
 * NEWEST closed bar only, and with the two feeds a replay cannot have — the live
 * order book and ticker — so the full Risk Engine runs, not just the
 * candle-computable gates.
 *
 * It **reuses the production engines directly** and recomputes nothing they own.
 * It produces `SignalCandidate`s and hands them to the Signal Engine; it never
 * publishes, ranks, or decides Prime — that authority lives downstream where it
 * belongs (AGENTS.md §2). Its answer is usually an empty array, and that is the
 * platform working, not failing (§1).
 */
@Injectable()
export class ScanOrchestrator {
  private readonly logger = new Logger(ScanOrchestrator.name);
  private readonly policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY;

  constructor(
    private readonly indicators: IndicatorService,
    private readonly registry: IndicatorRegistry,
    private readonly patterns: PatternService,
    private readonly regime: RegimeService,
    private readonly strategies: StrategyRepository,
    private readonly resolver: DependencyResolver,
    private readonly evaluator: StrategyEvaluator,
    private readonly risk: RiskService,
    private readonly confidence: ConfidenceService,
    private readonly market: MarketService,
  ) {}

  /** Every timeframe any runnable strategy needs, so a caller fetches exactly once. */
  requiredTimeframes(): Timeframe[] {
    const needed = new Set<Timeframe>();
    for (const strategy of this.strategies.runnable()) {
      needed.add(strategy.timeframe);
      for (const tf of this.resolver.resolve(strategy).timeframes) needed.add(tf);
    }
    return [...needed];
  }

  /**
   * Run every runnable strategy against one symbol and return the risk-approved,
   * confidence-scored candidates — ready for the Signal Engine.
   *
   * `allSettled` throughout: a single strategy or a single missing feed must never
   * abort the symbol, let alone the scan. A candidate that cannot be assembled is
   * SKIPPED with a reason, never guessed.
   */
  async scanSymbol(input: {
    symbol: string;
    exchange: string;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
    btcByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
    now: number;
  }): Promise<SignalCandidate[]> {
    const { symbol, exchange, candlesByTimeframe, btcByTimeframe, now } = input;

    const strategies = this.strategies.runnable();
    const out: SignalCandidate[] = [];

    const results = await Promise.allSettled(
      strategies.map((strategy) =>
        this.evaluateOne({ strategy, symbol, exchange, candlesByTimeframe, btcByTimeframe, now }),
      ),
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        if (result.value) out.push(result.value);
        return;
      }
      this.logger.debug(
        { strategy: strategies[i].id, symbol, err: result.reason },
        "A strategy could not be assembled for this symbol — skipped, not guessed",
      );
    });

    return out;
  }

  /* ── One strategy, one symbol ─────────────────────────────────────── */

  private async evaluateOne(input: {
    strategy: StrategyDefinition;
    symbol: string;
    exchange: string;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
    btcByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
    now: number;
  }): Promise<SignalCandidate | null> {
    const { strategy, symbol, exchange, candlesByTimeframe, btcByTimeframe, now } = input;
    const primary = strategy.timeframe;

    const dependencies = this.resolver.resolve(strategy);
    const wants = new Set<Timeframe>([primary, ...dependencies.timeframes]);

    // A world we only half-see is not a world we evaluate.
    for (const tf of wants) {
      if (!candlesByTimeframe[tf]?.length) return null;
    }

    const candles = Object.fromEntries(
      [...wants].map((tf) => [tf, candlesByTimeframe[tf]!] as const),
    ) as Record<string, readonly Candle[]>;

    /* ── Assemble the world (the engines own every number here) ─────── */

    const [indicatorSeries, patternSets, market] = await Promise.all([
      this.resolveIndicators(symbol, dependencies, candles),
      this.resolvePatterns(symbol, candles),
      this.regime.context({ symbol, primary, candlesByTimeframe: candles }),
    ]);

    const patternsByTf: Record<string, readonly DetectedPattern[]> = Object.fromEntries(
      [...patternSets.entries()].map(([tf, set]) => [tf, set.patterns] as const),
    );

    const bar = candles[primary]!.at(-1)!;

    const result = this.evaluator.evaluate(strategy, {
      symbol,
      exchange,
      timeframe: primary,
      candles,
      indicators: indicatorSeries,
      patterns: patternsByTf,
      market,
      regime: market.timeframes[primary]!.direction,
      bar,
    });

    if (result.kind !== "candidate") return null;

    const candidate = result.candidate;
    const primaryCandles = candles[primary]!;
    const primarySet = patternSets.get(primary);
    const zones = primarySet?.zones ?? [];
    const patternsPrimary = primarySet?.patterns ?? [];

    /* ── The Risk Engine — with the LIVE feeds a replay cannot have ── */

    // The stop-quality and volatility gates read ATR(14) under this exact key.
    const atrKey = indicatorKey({ indicator: "atr", timeframe: primary, params: { period: 14 } });
    const riskIndicators: Record<string, readonly Maybe[]> = { ...indicatorSeries };
    if (!riskIndicators[atrKey]) {
      const atr = await this.computeAtr(symbol, primary, primaryCandles);
      if (atr) riskIndicators[atrKey] = atr;
    }

    const [book, ticker] = await Promise.all([
      this.market.orderBook(symbol, exchange as never).catch(() => null),
      this.market.ticker(symbol, exchange as never).catch(() => null),
    ]);

    const exchangeHealth =
      this.market.health().find((h) => h.exchange === exchange) ?? null;

    const btcCorrelation = this.risk.correlation(
      primaryCandles,
      btcByTimeframe[primary] ?? [],
    );

    const decision = this.risk.validate({
      candidate,
      strategy,
      candles: primaryCandles,
      indicators: riskIndicators,
      patterns: patternsPrimary,
      zones,
      market,
      book,
      ticker,
      exchange: exchangeHealth,
      btcCorrelation,
      now,
    });

    if (!decision.approved || !decision.assessment) return null;

    /* ── Confidence — the SAME engine, its full report ─────────────── */

    const series = {
      rsi: this.safeSeries(() => this.computeBare(primaryCandles, "rsi", { period: 14 })),
      macdHistogram: this.safeSeries(() =>
        this.computeBare(primaryCandles, "macd_histogram", {}),
      ),
      atr: this.safeSeries(() => this.computeBare(primaryCandles, "atr", { period: 14 })),
    };

    const regimeClass = market.timeframes[primary]!;

    const evidence: EvidenceSnapshot = {
      strategyId: strategy.id,
      rulesHash: strategy.rulesHash ?? "",
      symbol,
      exchange: exchange as EvidenceSnapshot["exchange"],
      timeframe: primary,
      direction: candidate.direction,
      regime: regimeClass.direction,
      volatilityState: regimeClass.volatility,
      volatilityBucket: volatilityBucket(primaryCandles, this.policy),
      liquidityBucket: liquidityBucket(primaryCandles, this.policy),
      riskLevel: decision.assessment.level,
      patterns: patternsPrimary.map((p) => p.pattern).sort(),
      // The pipeline recomputes the real score from the context; this is a
      // placeholder it overwrites, never a number a trader sees.
      score: 0,
    };

    const report = await this.confidence.assess({
      context: {
        candidate,
        strategy,
        policy: this.policy,
        candles: primaryCandles,
        patterns: patternsPrimary,
        zones,
        market,
        series,
        risk: decision.assessment,
        agreeingStrategies: [],
        historicalBase: null,
      },
      evidence,
    });

    return { candidate, risk: decision, confidence: report, market, now };
  }

  /* ── World assembly helpers (reuse the engines, own nothing) ──────── */

  private async resolveIndicators(
    symbol: string,
    dependencies: ReturnType<DependencyResolver["resolve"]>,
    candles: Record<string, readonly Candle[]>,
  ): Promise<Record<string, readonly Maybe[]>> {
    const out: Record<string, readonly Maybe[]> = {};

    const byTimeframe = new Map<Timeframe, typeof dependencies.indicators>();
    for (const dependency of dependencies.indicators) {
      const list = byTimeframe.get(dependency.timeframe) ?? [];
      list.push(dependency);
      byTimeframe.set(dependency.timeframe, list);
    }

    await Promise.all(
      [...byTimeframe.entries()].map(async ([timeframe, wanted]) => {
        if (!candles[timeframe]) return;
        const { series } = await this.indicators.calculateMany({
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
      }),
    );

    return out;
  }

  private async resolvePatterns(
    symbol: string,
    candles: Record<string, readonly Candle[]>,
  ): Promise<Map<Timeframe, Awaited<ReturnType<PatternService["detect"]>>>> {
    const out = new Map<Timeframe, Awaited<ReturnType<PatternService["detect"]>>>();

    // Patterns AND zones are wanted on every timeframe present — the risk engine
    // reads zones on the primary, and a strategy may key patterns off a higher one.
    await Promise.all(
      (Object.keys(candles) as Timeframe[]).map(async (timeframe) => {
        try {
          const set = await this.patterns.detect({
            symbol,
            candles: candles[timeframe]!,
            timeframe,
          });
          out.set(timeframe, set);
        } catch {
          /* Too few candles for structure — the timeframe simply has no patterns. */
        }
      }),
    );

    return out;
  }

  private async computeAtr(
    symbol: string,
    timeframe: Timeframe,
    candles: readonly Candle[],
  ): Promise<readonly Maybe[] | null> {
    try {
      const { series } = await this.indicators.calculateMany({
        symbol,
        candles,
        timeframe,
        requests: [{ indicator: "atr" as never, params: { period: 14 } as never }],
      });
      const first = Object.values(series)[0];
      return first ? first.values.map((v) => v.value) : null;
    } catch {
      return null;
    }
  }

  private computeBare(
    candles: readonly Candle[],
    indicator: string,
    params: Record<string, unknown>,
  ): readonly Maybe[] {
    const calculator = this.registry.resolve(indicator as Indicator);
    return calculator.compute({
      candles,
      params: this.registry.parametersFor(indicator as Indicator, params),
    });
  }

  private safeSeries(compute: () => readonly Maybe[]): readonly Maybe[] | null {
    try {
      return compute();
    } catch {
      return null;
    }
  }
}

/* ── Buckets — ported from the confidence replay so live and history agree ── */

/** Volatility, measured against the instrument's OWN recent behaviour. */
function volatilityBucket(
  candles: readonly Candle[],
  policy: ConfidencePolicy,
): EvidenceSnapshot["volatilityBucket"] {
  const window = Math.min(policy.bucketBaselineBars, candles.length - 1);
  if (window < 10) return "NORMAL";

  const ranges = candles.slice(-(window + 1), -1).map((c) => (c.high - c.low) / c.close);
  const sorted = [...ranges].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return "NORMAL";

  const bar = candles[candles.length - 1];
  const ratio = (bar.high - bar.low) / bar.close / median;

  if (ratio < 0.6) return "LOW";
  if (ratio < 1.6) return "NORMAL";
  if (ratio < 3) return "HIGH";
  return "EXTREME";
}

/** Liquidity, from quote volume — available identically live and in the corpus. */
function liquidityBucket(
  candles: readonly Candle[],
  policy: ConfidencePolicy,
): EvidenceSnapshot["liquidityBucket"] {
  const recent = candles.slice(-Math.min(policy.bucketBaselineBars, candles.length));
  const quote =
    recent.reduce((sum, c) => sum + c.close * c.volume, 0) / Math.max(1, recent.length);

  if (quote < 250_000) return "THIN";
  if (quote < 5_000_000) return "ADEQUATE";
  return "DEEP";
}
