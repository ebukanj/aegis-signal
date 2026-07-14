import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  Candle,
  MarketContext,
  RegimeClassification,
  Timeframe,
} from "@aegis/contracts";
import { marketContextSchema } from "@aegis/contracts";
import { IndicatorService } from "../../../indicators/application/services/indicator.service";
import { PatternService } from "../../../patterns/application/services/pattern.service";
import { RegimeClassifier, type RegimeState } from "../classifiers/regime.classifier";
import { AlignmentService } from "./alignment.service";
import { RegimeCache } from "../cache/regime.cache";
import { assertWeightsValid, REGIME_WEIGHTS } from "../../regime.config";
import type { FeatureInput } from "../../domain/feature";
import type { Maybe } from "../../../indicators/application/math/rolling";

/**
 * The Market Regime Engine.
 *
 * Indicators describe the market. Patterns describe its structure. **This says what
 * ENVIRONMENT the market is in** — and everything downstream is entitled to know
 * that before it decides anything.
 *
 * No strategy should ever be evaluated without it, because a strategy that prints
 * money in a trend gets shredded in a range and the difference is not the strategy's
 * fault.
 *
 * ── The pipeline ──
 *
 *   candles → indicators → patterns → FEATURES → weighted vote → hysteresis → cache
 *
 * It consumes the two engines below it rather than re-deriving anything. That is not
 * only efficiency: a regime engine that computed its own trend would eventually
 * disagree with the Pattern Engine about whether the trend was intact, and then the
 * platform would be reasoning about two different markets.
 */
@Injectable()
export class RegimeService implements OnModuleInit {
  private readonly logger = new Logger(RegimeService.name);

  /**
   * The engine's memory, per symbol:timeframe.
   *
   * Hysteresis needs to remember not only what the regime IS, but who has been
   * challenging it and for how long. A classifier without this memory bails out of a
   * bull market on every pullback — which is exactly what the historical replay
   * caught it doing.
   */
  private readonly memory = new Map<string, RegimeState>();

  private classifications = 0;
  private failures = 0;
  private transitions = 0;
  private totalLatencyMs = 0;

  constructor(
    private readonly indicators: IndicatorService,
    private readonly patterns: PatternService,
    private readonly classifier: RegimeClassifier,
    private readonly alignment: AlignmentService,
    private readonly cache: RegimeCache,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    // Weights that sum to 0.9 do not fail. They quietly compress every agreement
    // score in the platform by 10%, and no test would ever catch it.
    assertWeightsValid(REGIME_WEIGHTS);
  }

  /* ── One timeframe ───────────────────────────────────────────────── */

  async classify(input: {
    symbol: string;
    timeframe: Timeframe;
    candles: readonly Candle[];
  }): Promise<RegimeClassification> {
    const started = Date.now();
    const { symbol, timeframe, candles } = input;

    const lastClosedBar = candles.at(-1)?.time ?? 0;

    const cached = await this.cache.get({ symbol, timeframe, lastClosedBar });
    if (cached) return cached;

    try {
      const features = await this.features(symbol, timeframe, candles);

      const key = `${symbol}:${timeframe}`;
      const state = this.memory.get(key) ?? null;
      const previous = state?.classification ?? null;

      const next = this.classifier.step({ features, timeframe, state });
      const classification = next.classification;

      /*
       * The TRANSITION event — and the reason `contradicting` exists.
       *
       * A regime change is not a log line. A strategy that was compatible a bar ago
       * may not be now, and an open position sized for a compressed market is now
       * sitting in an expanded one. The platform has to WAKE UP for this.
       */
      if (previous && previous.direction !== classification.direction) {
        this.transitions++;

        this.events.emit("regime.transition", {
          symbol,
          timeframe,
          from: previous.direction,
          to: classification.direction,
          previousBarsHeld: previous.barsHeld,
          agreement: classification.agreement,
          at: classification.at,
          // WHY it turned: the evidence that used to be contradictions and won.
          reason: classification.supporting.map((e) => e.detail),
        });

        this.logger.log(
          {
            symbol,
            timeframe,
            from: previous.direction,
            to: classification.direction,
            heldFor: previous.barsHeld,
          },
          "Regime changed",
        );
      }

      if (
        previous?.direction === classification.direction &&
        classification.barsHeld === CONFIRMED_AFTER_BARS
      ) {
        // Confirmed: it has now held long enough to be a fact rather than a guess.
        this.events.emit("regime.confirmed", {
          symbol,
          timeframe,
          regime: classification.direction,
          barsHeld: classification.barsHeld,
        });
      }

      if (previous?.volatility !== classification.volatility) {
        this.events.emit("regime.volatility", {
          symbol,
          timeframe,
          from: previous?.volatility ?? null,
          to: classification.volatility,
        });
      }

      this.memory.set(key, next);
      await this.cache.set({ symbol, timeframe, lastClosedBar }, classification);

      this.classifications++;
      this.totalLatencyMs += Date.now() - started;

      return classification;
    } catch (error) {
      this.failures++;

      /*
       * Rethrown, never swallowed into a default "RANGE".
       *
       * A failed classification that returned RANGE would be indistinguishable from
       * a market that genuinely is ranging — and every mean-reversion strategy on the
       * platform would start trading on the strength of an exception nobody saw.
       */
      this.logger.error(
        { symbol, timeframe, err: error },
        "Regime classification FAILED — no regime is better than a wrong one",
      );
      throw error;
    }
  }

  /* ── Every timeframe ─────────────────────────────────────────────── */

  /**
   * The full context: every timeframe, plus whether they agree.
   *
   * `allSettled`, because a timeframe with too little history (a coin listed last
   * week has no 1d candles worth speaking of) must not blind the ones that do.
   */
  async context(input: {
    symbol: string;
    primary: Timeframe;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
  }): Promise<MarketContext> {
    const { symbol, primary, candlesByTimeframe } = input;

    const timeframes: Partial<Record<Timeframe, RegimeClassification>> = {};

    const results = await Promise.allSettled(
      (Object.entries(candlesByTimeframe) as [Timeframe, readonly Candle[]][]).map(
        async ([timeframe, candles]) => ({
          timeframe,
          classification: await this.classify({ symbol, timeframe, candles }),
        }),
      ),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        timeframes[result.value.timeframe] = result.value.classification;
      }
    }

    if (!timeframes[primary]) {
      throw new Error(
        `Cannot build a market context for ${symbol}: the primary timeframe ` +
          `(${primary}) could not be classified, and a context without its operative ` +
          `timeframe is not a context.`,
      );
    }

    const context: MarketContext = {
      symbol,
      timeframes,
      alignment: this.alignment.alignment(timeframes),
      conflict: this.alignment.conflict(timeframes, primary),
      primary,
      at: timeframes[primary]!.at,
    };

    // Validated against the contract before it leaves. A classification with no
    // supporting evidence, or an out-of-range agreement, is caught here.
    const parsed = marketContextSchema.safeParse(context);

    if (!parsed.success) {
      throw new Error(
        `The regime engine produced a context that violates its own contract: ` +
          parsed.error.issues.map((i) => i.message).join("; "),
      );
    }

    this.events.emit("regime.context", {
      symbol,
      primary,
      regime: timeframes[primary]!.direction,
      volatility: timeframes[primary]!.volatility,
      alignment: context.alignment,
      conflict: context.conflict,
    });

    return parsed.data;
  }

  /* ── Features ────────────────────────────────────────────────────── */

  /**
   * Everything the voters need, computed once.
   *
   * The indicators the features read are hard-coded here rather than requested per
   * feature, deliberately: the regime is a fixed question, and letting each extractor
   * ask for whatever it liked would make the cost of adding a feature unbounded and
   * the cache key impossible to reason about.
   */
  private async features(
    symbol: string,
    timeframe: Timeframe,
    candles: readonly Candle[],
  ): Promise<FeatureInput> {
    const requests = [
      { indicator: "close" as const },
      { indicator: "ema" as const, params: { period: 50 } },
      { indicator: "ema" as const, params: { period: 200 } },
      { indicator: "adx" as const },
      { indicator: "plus_di" as const },
      { indicator: "minus_di" as const },
      { indicator: "rsi" as const },
      { indicator: "macd_histogram" as const },
      { indicator: "cci" as const },
      { indicator: "atr" as const },
      { indicator: "bb_width" as const },
      { indicator: "obv" as const },
      { indicator: "vwap" as const },
    ];

    const { series } = await this.indicators.calculateMany({
      symbol,
      candles,
      timeframe,
      requests,
    });

    /*
     * Re-keyed to the names the extractors use ("ema:50", not
     * "ema:period=50:1h"). A feature should not have to know the cache's naming rule,
     * and the two EMAs must not collide — which they would under a bare "ema" key,
     * with the 200 silently overwriting the 50.
     */
    const indicators: Record<string, readonly Maybe[]> = {};

    for (const [key, value] of Object.entries(series)) {
      const values = value.values.map((v) => v.value);

      const name = key.split(":")[0];
      const period = value.params?.period;

      indicators[name === "ema" && period ? `ema:${period}` : name] = values;
    }

    const patternSet = await this.patterns.detect({
      symbol,
      candles,
      timeframe,
    });

    return {
      candles,
      indicators,
      patterns: patternSet.patterns,
      structure: patternSet.structure,
    };
  }

  /* ── Administration ──────────────────────────────────────────────── */

  metrics() {
    const held = [...this.memory.values()].map((s) => s.classification);

    return {
      classifications: this.classifications,
      failures: this.failures,
      transitions: this.transitions,
      averageLatencyMs:
        this.classifications === 0
          ? 0
          : this.totalLatencyMs / this.classifications,

      /**
       * Average bars a regime has held.
       *
       * The stability number, and the one an operator should actually watch. A
       * platform whose regimes last three bars is a platform whose classifier is
       * noise — and it would show up here long before it showed up in a losing trade.
       */
      averageBarsHeld:
        held.length === 0
          ? 0
          : held.reduce((s, c) => s + c.barsHeld, 0) / held.length,

      averageAgreement:
        held.length === 0
          ? 0
          : held.reduce((s, c) => s + c.agreement, 0) / held.length,

      current: Object.fromEntries(
        [...this.memory.entries()].map(([key, { classification: c }]) => [
          key,
          {
            direction: c.direction,
            volatility: c.volatility,
            agreement: Number(c.agreement.toFixed(2)),
            barsHeld: c.barsHeld,
          },
        ]),
      ),

      cache: this.cache.stats(),
    };
  }
}

/** A regime that has held this long is a fact rather than a guess. */
const CONFIRMED_AFTER_BARS = 5;
