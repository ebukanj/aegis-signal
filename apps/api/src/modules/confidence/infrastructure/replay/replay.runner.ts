import { Injectable, Logger } from "@nestjs/common";
import {
  indicatorKey,
  type Candle,
  type DetectedPattern,
  type EvidenceSnapshot,
  type Indicator,
  type LabelledSetup,
  type MarketContext,
  type RegimeClassification,
  type StrategyDefinition,
  type Timeframe,
} from "@aegis/contracts";

import { IndicatorRegistry } from "../../../indicators/application/registry/indicator.registry";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";
import type { Maybe } from "../../../indicators/application/math/rolling";
import { SwingEngine } from "../../../patterns/application/services/swing.engine";
import { StructureEngine } from "../../../patterns/application/services/structure.engine";
import { ZoneEngine } from "../../../patterns/application/services/zone.engine";
import { PatternRegistry } from "../../../patterns/application/registry/pattern.registry";
import { MINIMUM_REPORTABLE_QUALITY } from "../../../patterns/domain/pattern.interface";
import { RegimeClassifier } from "../../../regime/application/classifiers/regime.classifier";
import type { RegimeState } from "../../../regime/application/classifiers/regime.classifier";
import { AlignmentService } from "../../../regime/application/services/alignment.service";
import { DependencyResolver } from "../../../strategy/application/resolver/dependency.resolver";
import { StrategyEvaluator } from "../../../strategy/application/executor/strategy.evaluator";
import { RiskPipeline } from "../../../risk/application/services/risk.pipeline";
import { HISTORICALLY_REPLAYABLE } from "../../../risk/application/validators";
import { DEFAULT_RISK_POLICY } from "../../../risk/risk.policy";
import { ScoreBuilder } from "../../application/scoring/score.builder";
import type { ConfidencePolicy } from "../../confidence.policy";
import { label } from "./outcome.labeller";

/**
 * The replay — where confidence is EARNED rather than asserted.
 *
 * It walks exchange history one bar at a time and asks, at every bar, the exact
 * question the live platform asks: *does a strategy fire here, does the Risk
 * Engine allow it, and what score does the evidence deserve?* Then it walks
 * forward and finds out what actually happened.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT IS MULTI-TIMEFRAME, AND THE FIRST VERSION OF THIS FILE WAS NOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Worth recording, because the bug was invisible and the failure looked like a
 * finding.
 *
 * The first version replayed 1h candles only. It produced **zero setups from
 * 17,520 bars** and finished in thirteen seconds, and the temptation was to read
 * that as "the strategies are simply very selective."
 *
 * They are not. Every one of the six is multi-timeframe — Breakout wants
 * `ema:200:4h` and `adx:14:4h`, Trend Pullback lives on the 4h and reads the 1d,
 * Level Bounce runs on the 15m. With only 1h indicators supplied, dependency
 * resolution failed for all six and every strategy stood down without evaluating
 * a single rule.
 *
 * **A replay of a system you are not actually running produces a number about
 * nothing.** Had it emitted a plausible-looking 40% win rate instead of zero, the
 * error would have shipped — and every confidence score the platform ever printed
 * would have been calibrated against a machine that does not exist.
 *
 * So the replay assembles the SAME multi-timeframe world the live pipeline does,
 * and each strategy is evaluated on its OWN primary timeframe.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE THREE WAYS A BACKTEST LIES, AND WHAT IS DONE ABOUT EACH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **1 · Look-ahead.** Any peek at data that had not happened yet.
 *
 *    Guard: a bar of the primary timeframe closing at T sees higher-timeframe bars
 *    only if THEY have also closed by T. The 4h candle containing T has not
 *    finished forming and is invisible — which is the single subtlest look-ahead
 *    bug available in a multi-timeframe backtest, and the one that makes a
 *    strategy look prescient. Outcomes are labelled from candles strictly after T.
 *
 * **2 · A different engine.** A replay that reimplements the strategy logic is
 *    measuring a system nobody will trade.
 *
 *    Guard: this file constructs no logic of its own. It calls the SAME
 *    `StrategyEvaluator`, `RiskPipeline`, `RegimeClassifier`, `AlignmentService`
 *    and `ScoreBuilder` production calls. If those are wrong, the replay is wrong
 *    in exactly the same way — the only kind of consistency worth anything.
 *
 * **3 · In-sample optimism.** ADR-024 names this an ACCEPTED risk: these six
 *    strategies were written by people who had already lived through this history.
 *
 *    Guard: walk-forward, and the result is labelled HISTORICAL forever — never
 *    LIVE, never merged into a live track record. It is a prior, announced as one.
 */
@Injectable()
export class ReplayRunner {
  private readonly logger = new Logger(ReplayRunner.name);

  constructor(
    private readonly indicators: IndicatorRegistry,
    private readonly swings: SwingEngine,
    private readonly structure: StructureEngine,
    private readonly zones: ZoneEngine,
    /*
     * The detectors directly, not PatternService — which adds a Redis cache and an
     * event emitter, both correct live and both pure overhead in a loop that runs
     * tens of thousands of times and shares nothing between iterations. The
     * DETECTORS are the identical objects production uses.
     */
    private readonly detectors: PatternRegistry,
    private readonly regime: RegimeClassifier,
    private readonly alignment: AlignmentService,
    private readonly resolver: DependencyResolver,
    private readonly evaluator: StrategyEvaluator,
    private readonly risk: RiskPipeline,
    private readonly scorer: ScoreBuilder,
  ) {}

  /** How much history a bar may SEE. Bounds the work, not the indicators' warmup. */
  private static readonly WINDOW = 320;

  /** Bars of warmup before a setup is taken seriously. */
  private static readonly WARMUP = 260;

  async run(input: {
    strategies: readonly StrategyDefinition[];
    symbol: string;
    exchange: string;
    candlesByTimeframe: Partial<Record<Timeframe, readonly Candle[]>>;
    policy: ConfidencePolicy;
    splitAt: number;
  }): Promise<LabelledSetup[]> {
    const { strategies, symbol, exchange, candlesByTimeframe, policy, splitAt } = input;

    /* ── What does anybody actually need? ──────────────────────────── */

    const needed = new Set<Timeframe>();
    for (const strategy of strategies) {
      for (const tf of this.resolver.resolve(strategy).timeframes) needed.add(tf);
      needed.add(strategy.timeframe);
    }

    const usable = strategies.filter((strategy) => {
      const wants = new Set(this.resolver.resolve(strategy).timeframes);
      wants.add(strategy.timeframe);

      const missing = [...wants].filter(
        (tf) => (candlesByTimeframe[tf]?.length ?? 0) < ReplayRunner.WARMUP,
      );

      if (missing.length > 0) {
        this.logger.warn(
          `${symbol}: ${strategy.id} needs ${missing.join(", ")} candles and there are not enough — it is SKIPPED rather than evaluated on a world it only half-sees`,
        );
        return false;
      }

      return true;
    });

    if (usable.length === 0) return [];

    /* ── Precompute each timeframe, once ───────────────────────────── */

    const world = new Map<Timeframe, TimeframeWorld>();

    for (const tf of needed) {
      const candles = candlesByTimeframe[tf];
      if (!candles || candles.length < ReplayRunner.WARMUP) continue;

      world.set(tf, this.precompute(candles, tf, strategies));
    }

    /* ── Replay, one strategy at a time, each on ITS OWN timeframe ── */

    const setups: LabelledSetup[] = [];

    /*
     * WHY nothing fired.
     *
     * The live StrategyService counts its rejection reasons for exactly this
     * purpose, and the replay needs it more, not less. A replay that returns zero
     * setups is either a very selective strategy or a broken pipeline, and the two
     * are indistinguishable from the outside — the first version of this file
     * returned zero because every strategy was standing down for want of a
     * timeframe, and it looked exactly like selectivity.
     *
     * A silent zero is the most dangerous result this file can produce, because it
     * is the one a person is most likely to accept.
     */
    const rejections = new Map<string, number>();
    const vetoes = new Map<string, number>();

    /* Per-strategy tally, so a zero can be attributed rather than merely observed. */
    const tally = new Map<
      string,
      { evaluated: number; candidates: number; approved: number; topReject: Map<string, number> }
    >();
    const bump = (id: string, field: "evaluated" | "candidates" | "approved"): void => {
      const t =
        tally.get(id) ??
        { evaluated: 0, candidates: 0, approved: 0, topReject: new Map<string, number>() };
      t[field] += 1;
      tally.set(id, t);
    };

    for (const strategy of usable) {
      const primary = strategy.timeframe;
      const home = world.get(primary);
      const candles = candlesByTimeframe[primary];

      if (!home || !candles) continue;

      const wants = new Set(this.resolver.resolve(strategy).timeframes);
      wants.add(primary);

      const span = timeframeMs(primary);

      /*
       * The last bar a setup may be taken on.
       *
       * A setup near the end of the corpus has no future left to be judged against
       * and would be labelled EXPIRED purely because history ran out. That is not
       * an expiry, it is a truncation — and it would poison the base rate with a
       * block of artificial non-wins clustered at the newest end of the data, which
       * is exactly the validation split. Stop early.
       */
      const lastBar = candles.length - policy.maximumBarsHeld - 1;

      /* Monotonic cursors into the higher timeframes. */
      const cursor = new Map<Timeframe, number>();
      for (const tf of wants) cursor.set(tf, 0);

      for (let i = ReplayRunner.WARMUP; i < lastBar; i += 1) {
        const bar = candles[i];

        /*
         * ══════════════════════════════════════════════════════════════
         *  THE LINE THAT PREVENTS THE SUBTLEST LOOK-AHEAD BUG THERE IS
         * ══════════════════════════════════════════════════════════════
         *
         * The primary bar CLOSES at `close`. A higher-timeframe bar is visible
         * only if it has closed by then — `bar.time + span(tf) <= close`.
         *
         * The obvious, wrong alternative is to take the 4h bar CONTAINING this 1h
         * bar. That candle has not finished forming: its high, its low and its
         * close are all still moving, and three of the four are facts about the
         * future. A strategy handed it would appear to predict the next three
         * hours, backtest magnificently, and lose money live.
         */
        const close = bar.time + span;

        const indicators: Record<string, readonly Maybe[]> = {};
        const windows: Partial<Record<Timeframe, readonly Candle[]>> = {};
        const patterns: Partial<Record<Timeframe, readonly DetectedPattern[]>> = {};
        const regimes: Partial<Record<Timeframe, RegimeClassification>> = {};

        let complete = true;

        for (const tf of wants) {
          const w = world.get(tf);
          const tfCandles = candlesByTimeframe[tf];

          if (!w || !tfCandles) {
            complete = false;
            break;
          }

          const tfSpan = timeframeMs(tf);

          /* Advance the cursor to the newest bar that has CLOSED by `close`. */
          let j = cursor.get(tf)!;
          while (j + 1 < tfCandles.length && tfCandles[j + 1].time + tfSpan <= close) {
            j += 1;
          }
          cursor.set(tf, j);

          if (j < ReplayRunner.WARMUP || tfCandles[j].time + tfSpan > close) {
            complete = false;
            break;
          }

          const from = Math.max(0, j - ReplayRunner.WINDOW + 1);

          windows[tf] = tfCandles.slice(from, j + 1);
          patterns[tf] = w.patterns[j] ?? [];
          regimes[tf] = w.regimes[j];

          for (const [key, series] of Object.entries(w.indicators)) {
            indicators[key] = series.slice(from, j + 1);
          }
        }

        if (!complete || !regimes[primary]) continue;

        const market: MarketContext = {
          symbol,
          timeframes: regimes,
          alignment: this.alignment.alignment(regimes),
          conflict: this.alignment.conflict(regimes, primary),
          primary,
          at: bar.time,
        };

        /* ── The evaluator. The SAME one production calls. ──────── */

        const result = this.evaluator.evaluate(strategy, {
          symbol,
          exchange,
          timeframe: primary,
          candles: windows as Record<string, readonly Candle[]>,
          indicators,
          patterns: patterns as Record<string, readonly DetectedPattern[]>,
          market,
          regime: regimes[primary]!.direction,
          bar,
        });

        bump(strategy.id, "evaluated");

        if (result.kind !== "candidate") {
          const reason = normalise(result.reason ?? "unknown");
          const why = `${strategy.id}: ${reason}`;
          rejections.set(why, (rejections.get(why) ?? 0) + 1);
          const t = tally.get(strategy.id)!;
          t.topReject.set(reason, (t.topReject.get(reason) ?? 0) + 1);
          continue;
        }

        bump(strategy.id, "candidates");
        const candidate = result.candidate;

        /* ── The veto — the gates history can actually answer ───── */

        const zones = home.zones(i);

        const decision = this.risk.decide(
          {
            candidate,
            strategy,
            policy: DEFAULT_RISK_POLICY,
            candles: windows[primary]!,
            indicators,
            patterns: patterns[primary] ?? [],
            zones,
            market,
            /*
             * Null, and it MUST be null. Synthesising a plausible order book for
             * March 2024 would put a fabricated number into the corpus that every
             * statistic downstream would treat as a measurement.
             */
            book: null,
            ticker: null,
            exchange: null,
            btcCorrelation: null,
            now: bar.time,
          },
          HISTORICALLY_REPLAYABLE,
        );

        if (!decision.approved || !decision.assessment) {
          const why = `${strategy.id}: [${decision.gate}] ${normalise(decision.reason ?? "")}`;
          vetoes.set(why, (vetoes.get(why) ?? 0) + 1);
          const t = tally.get(strategy.id)!;
          t.topReject.set(`VETO ${decision.gate}`, (t.topReject.get(`VETO ${decision.gate}`) ?? 0) + 1);
          continue;
        }

        bump(strategy.id, "approved");

        /* ── The score — the SAME builder production uses ───────── */

        const slice = (series: readonly Maybe[] | null): readonly Maybe[] | null => {
          if (!series) return null;
          const j = cursor.get(primary)!;
          return series.slice(Math.max(0, j - ReplayRunner.WINDOW + 1), j + 1);
        };

        const { score } = this.scorer.build({
          candidate,
          strategy,
          policy,
          candles: windows[primary]!,
          series: {
            rsi: slice(home.scoring.rsi),
            macdHistogram: slice(home.scoring.macdHistogram),
            atr: slice(home.scoring.atr),
          },
          patterns: patterns[primary] ?? [],
          zones,
          market,
          risk: decision.assessment,
          /*
           * Confluence is not measurable here without evaluating every strategy on
           * every timeframe at every bar. It is worth ZERO points anyway (ADR-024
           * §6 — the uplift is not yet priced), so its absence cannot shift the
           * score distribution the calibration is fitted on. The moment it is worth
           * anything, it must be computed here too, and the policy's coherence
           * check refuses to boot if somebody prices it without doing so.
           */
          agreeingStrategies: [],
          historicalBase: null,
        });

        /* ── What actually happened ─────────────────────────────── */

        const outcome = label(
          candles.slice(i + 1),
          candidate.direction,
          candidate.entryPrice,
          candidate.proposedStop,
          candidate.proposedTargets[0],
          policy.maximumBarsHeld,
        );

        setups.push({
          evidence: {
            strategyId: strategy.id,
            rulesHash: strategy.rulesHash ?? "",
            symbol,
            exchange: exchange as EvidenceSnapshot["exchange"],
            timeframe: primary,
            direction: candidate.direction,
            regime: regimes[primary]!.direction,
            volatilityState: regimes[primary]!.volatility,
            volatilityBucket: volatilityBucket(windows[primary]!, policy),
            liquidityBucket: liquidityBucket(windows[primary]!, policy),
            riskLevel: decision.assessment.level,
            patterns: (patterns[primary] ?? []).map((p) => p.pattern).sort(),
            score,
          },
          barTime: bar.time,
          entryPrice: candidate.entryPrice,
          stopPrice: candidate.proposedStop,
          targetPrice: candidate.proposedTargets[0],
          outcome: outcome.outcome,
          realisedR: outcome.realisedR,
          barsHeld: outcome.barsHeld,
          split: bar.time < splitAt ? "CALIBRATION" : "VALIDATION",
        });
      }
    }

    const wins = setups.filter((s) => s.outcome === "WIN").length;
    const losses = setups.filter((s) => s.outcome === "LOSS").length;

    const perStrategy = [...tally.entries()]
      .map(([id, t]) => {
        const top = [...t.topReject.entries()].sort(([, a], [, b]) => b - a)[0];
        return `
    ${id.padEnd(15)} eval ${String(t.evaluated).padStart(6)} · cand ${String(t.candidates).padStart(4)} · appr ${String(t.approved).padStart(4)}` +
          (top ? ` · top: ${top[1]}× ${top[0].slice(0, 70)}` : "");
      })
      .join("");

    this.logger.log(
      `${symbol}: ${setups.length} setups (${wins}W / ${losses}L / ${setups.length - wins - losses}X)${perStrategy}`,
    );

    if (setups.length === 0) {
      /*
       * Zero setups is a claim, and it must be justified. If the reasons are all
       * "no break of structure", the strategies are working and the market did not
       * offer. If they are all "could not evaluate cvd", the platform is BLIND and
       * nobody would otherwise know.
       */
      const top = (m: Map<string, number>): string =>
        [...m.entries()]
          .sort(([, a], [, b]) => b - a)
          .slice(0, 6)
          .map(([why, n]) => `
      ${String(n).padStart(7)}× ${why.slice(0, 110)}`)
          .join("");

      this.logger.warn(
        `${symbol}: NOTHING fired. Why the evaluator said no:${top(rejections)}` +
          (vetoes.size > 0 ? `
    …and why the Risk Engine vetoed:${top(vetoes)}` : ""),
      );
    }

    return setups;
  }

  /* ── Precomputation ────────────────────────────────────────────── */

  /**
   * Everything one timeframe knows, computed once.
   *
   * The indicators are computed over the FULL series, and that is not look-ahead:
   * every indicator in this platform is CAUSAL — the value at index i is a
   * function of candles 0…i and nothing later. An EMA at bar 500 is identical
   * whether you computed it from 500 candles or 20,000, because the candles after
   * 500 never entered the recursion.
   *
   * If that were ever untrue of one indicator, it would be the bug that made the
   * platform's entire track record fraudulent. It is a property of the indicators,
   * verified by their own tests — not an assumption made here.
   */
  private precompute(
    candles: readonly Candle[],
    timeframe: Timeframe,
    strategies: readonly StrategyDefinition[],
  ): TimeframeWorld {
    const indicators: Record<string, readonly Maybe[]> = {};

    const compute = (indicator: Indicator, params: Record<string, unknown>) => {
      const calculator = this.indicators.resolve(indicator);
      return calculator.compute({
        candles,
        params: this.indicators.parametersFor(indicator, params),
      });
    };

    /*
     * ══════════════════════════════════════════════════════════════════════
     *  THREE CONSUMERS, THREE KEY CONVENTIONS — AND THE BUG THAT CAUSED
     * ══════════════════════════════════════════════════════════════════════
     *
     * This is worth spelling out, because it produced a total, silent failure and
     * the failure looked like a finding.
     *
     * The strategy evaluator looks indicators up by the key the DEPENDENCY
     * RESOLVER builds from the document's own words: `ema:period=200:4h`. The
     * regime extractors look them up by BARE NAME: `adx`, `atr`, `ema:50`. The
     * Risk Engine builds its own: `atr:period=14:1h`.
     *
     * The first version of this method invented a fourth convention — the
     * registry's fully-merged defaults, `ema:period=200,source=close:4h` — and
     * populated only that. Every indicator condition in every strategy then failed
     * with "one of its indicators has not been computed", all five strategies
     * stood down, and the replay reported **zero setups from 70,080 candles**
     * while appearing to work perfectly.
     *
     * So we do not GUESS at keys. We ask each consumer what it will look up, and
     * we store the series under exactly that.
     */

    /* ── 1 · Exactly what the documents ask for ────────────────────── */

    for (const strategy of strategies) {
      for (const dependency of this.resolver.resolve(strategy).indicators) {
        if (dependency.timeframe !== timeframe) continue;
        if (indicators[dependency.key]) continue;

        try {
          indicators[dependency.key] = compute(
            dependency.indicator as Indicator,
            dependency.params,
          );
        } catch {
          /*
           * An indicator needing a feed that does not exist (the tier-5
           * derivatives: funding, open interest, long/short ratio). SKIPPED, never
           * substituted — the strategy depending on it stands down, which is
           * exactly what it does live.
           */
        }
      }
    }

    /* ── 2 · What the REGIME extractors read, by bare name ─────────── */

    for (const name of [
      "close",
      "adx",
      "plus_di",
      "minus_di",
      "rsi",
      "macd_histogram",
      "cci",
      "atr",
      "bb_width",
      "obv",
      "vwap",
    ] as Indicator[]) {
      try {
        indicators[name] = compute(name, {});
      } catch {
        /* Not available on this feed. The extractor abstains and says so. */
      }
    }

    indicators["ema:50"] = compute("ema", { period: 50 });
    indicators["ema:200"] = compute("ema", { period: 200 });

    /* ── 3 · What the RISK ENGINE reads ────────────────────────────── */

    /*
     * The stop-quality gate and the volatility gate both look up ATR(14) under
     * this exact key. Without it they VETO — "ATR is unavailable" — and the replay
     * would reject every candidate for want of a number it had already computed
     * under a different name.
     */
    indicators[indicatorKey({ indicator: "atr", timeframe, params: { period: 14 } })] =
      compute("atr", { period: 14 });

    /* ── 4 · What the CONTRIBUTORS read ────────────────────────────── */

    const scoring = {
      rsi: safely(() => compute("rsi", { period: 14 })),
      macdHistogram: safely(() => compute("macd_histogram", {})),
      atr: safely(() => compute("atr", { period: 14 })),
    };

    /* ── Swings, structure, regime and patterns, bar by bar ──────── */

    const regimes: RegimeClassification[] = new Array(candles.length);
    const patterns: DetectedPattern[][] = new Array(candles.length);

    let state: RegimeState | null = null;

    const relative = relativeVolume(candles);

    for (let i = ReplayRunner.WARMUP; i < candles.length; i += 1) {
      const from = Math.max(0, i - ReplayRunner.WINDOW + 1);
      const window = candles.slice(from, i + 1);

      const swings = this.swings.detect(window);
      const structure = this.structure.analyse({
        candles: window,
        swings: swings.all,
        timeframe,
      });

      const sliced: Record<string, readonly Maybe[]> = {};
      for (const [key, series] of Object.entries(indicators)) {
        sliced[key] = series.slice(from, i + 1);
      }

      state = this.regime.step({
        features: { candles: window, indicators: sliced, patterns: [], structure },
        timeframe,
        state,
      });

      regimes[i] = state.classification;

      patterns[i] = this.detectors
        .all()
        .filter(
          (d) =>
            window.length >= d.minimumCandles && swings.all.length >= d.minimumSwings,
        )
        .flatMap((d) =>
          d.detect({
            candles: window,
            swings: swings.all,
            timeframe,
            relativeVolume: relative.slice(from, i + 1),
          }),
        )
        .filter((p) => p.quality >= MINIMUM_REPORTABLE_QUALITY);
    }

    return {
      indicators,
      scoring,
      regimes,
      patterns,
      /*
       * Zones are computed on demand rather than stored.
       *
       * Only the strategy's PRIMARY timeframe needs them (the Risk Engine's
       * structure gate and the structure contributor), and holding forty zone
       * objects for each of seventy thousand 15m bars would cost hundreds of
       * megabytes to answer a question asked for a handful of them.
       */
      zones: (i: number) => {
        const from = Math.max(0, i - ReplayRunner.WINDOW + 1);
        const window = candles.slice(from, i + 1);
        const swings = this.swings.detect(window);

        return this.zones.detect({ candles: window, swings: swings.all, timeframe });
      },
    };
  }
}

/** Collapse the numbers out of a reason so identical failures group together. */
function normalise(reason: string): string {
  return reason.replace(/-?\d+(\.\d+)?/g, "N");
}

function safely(compute: () => readonly Maybe[]): readonly Maybe[] | null {
  try {
    return compute();
  } catch {
    return null;
  }
}

interface TimeframeWorld {
  readonly indicators: Record<string, readonly Maybe[]>;
  readonly scoring: {
    readonly rsi: readonly Maybe[] | null;
    readonly macdHistogram: readonly Maybe[] | null;
    readonly atr: readonly Maybe[] | null;
  };
  readonly regimes: RegimeClassification[];
  readonly patterns: DetectedPattern[][];
  readonly zones: (index: number) => ReturnType<ZoneEngine["detect"]>;
}

/* ── Volume, relative to its own TRAILING mean ─────────────────────── */

/**
 * The baseline is strictly trailing: bar i is compared against bars before i,
 * never against a window containing itself. A spike included in its own baseline
 * measures itself as smaller than it is — the same bug found three times already
 * in this codebase (order blocks, RISK_OFF, volatility expansion). Not a fourth.
 */
function relativeVolume(candles: readonly Candle[]): (number | null)[] {
  const LOOKBACK = 20;
  const out: (number | null)[] = [];

  let sum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    if (i < LOOKBACK) {
      out.push(null);
    } else {
      const mean = sum / LOOKBACK;
      out.push(mean > 0 ? candles[i].volume / mean : null);
      sum -= candles[i - LOOKBACK].volume;
    }
    sum += candles[i].volume;
  }

  return out;
}

/* ── The buckets ───────────────────────────────────────────────────── */

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

/**
 * Liquidity, from QUOTE VOLUME — and this choice is load-bearing.
 *
 * The obvious measure is order-book depth. It is also unavailable: nobody stored
 * the book of March 2024, so a depth-based bucket would exist live and be
 * structurally absent in the corpus, and the two score distributions would
 * silently diverge — invalidating every calibrated number the platform prints.
 *
 * Quote volume (price × volume) is in every candle ever recorded. It is a cruder
 * proxy and an HONEST one, available identically in both worlds. Crude and
 * consistent beats precise and unavailable.
 */
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
