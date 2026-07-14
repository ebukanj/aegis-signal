import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  Candle,
  DetectedPattern,
  MarketStructure,
  Pattern,
  PatternSet,
  Timeframe,
  Zone,
} from "@aegis/contracts";
import { detectedPatternSchema } from "@aegis/contracts";
import { PatternRegistry } from "../registry/pattern.registry";
import { SwingEngine, DEFAULT_STRENGTH } from "./swing.engine";
import { StructureEngine } from "./structure.engine";
import { ZoneEngine } from "./zone.engine";
import { PatternCache } from "../cache/pattern.cache";
import type { DetectionContext } from "../../domain/pattern.interface";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * The Pattern Engine's front door.
 *
 * The pipeline, in the order the milestone specifies:
 *
 *   candles → VALIDATE → swings → structure → detect → score → cache → publish
 *
 * ── Swings are computed ONCE ──
 *
 * Not once per detector. Twenty-four detectors each running their own swing
 * detection would be twenty-four times the work — but that is the *lesser* reason.
 * The real one: two detectors that computed their own swings could disagree about
 * where a swing is, and then "bull flag confirmed by intact structure" would be
 * confirming itself against a market it had drawn differently. Sharing the swings
 * makes that impossible rather than merely unlikely.
 *
 * ── It never decides ──
 *
 * This service finds structure. It does not say a setup is good, does not rank
 * anything, does not know what a signal is. Patterns are evidence.
 */
@Injectable()
export class PatternService {
  private readonly logger = new Logger(PatternService.name);

  private detections = 0;
  private failures = 0;
  private totalLatencyMs = 0;
  private patternsFound = 0;

  constructor(
    private readonly registry: PatternRegistry,
    private readonly swings: SwingEngine,
    private readonly structure: StructureEngine,
    private readonly zones: ZoneEngine,
    private readonly cache: PatternCache,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Everything the engine can see on one symbol, one timeframe.
   */
  async detect(input: {
    symbol: string;
    candles: readonly Candle[];
    timeframe: Timeframe;
    swingStrength?: number;
    /** Only these patterns. Omit for all of them. */
    only?: Pattern[];
  }): Promise<PatternSet & { structure: MarketStructure }> {
    const started = Date.now();

    this.assertUsable(input.candles, input.timeframe);

    const strength = input.swingStrength ?? DEFAULT_STRENGTH;
    const lastClosedBar = input.candles.at(-1)!.time;

    const cached = await this.cache.get({
      symbol: input.symbol,
      timeframe: input.timeframe,
      strength,
      lastClosedBar,
    });

    if (cached) {
      this.events.emit("pattern.cache.hit", {
        symbol: input.symbol,
        timeframe: input.timeframe,
      });
      return cached;
    }

    // ── Stage 1: swings. Once, and shared.
    const sequence = this.swings.detect(input.candles, strength);

    // ── Stage 2: structure.
    const structure = this.structure.analyse({
      candles: input.candles,
      swings: sequence.all,
      timeframe: input.timeframe,
    });

    // ── Stage 3: zones.
    const zones: Zone[] = this.zones.detect({
      candles: input.candles,
      swings: sequence.all,
      timeframe: input.timeframe,
    });

    // ── Stages 4–9: the detectors.
    const context: DetectionContext = {
      candles: input.candles,
      swings: sequence.all,
      timeframe: input.timeframe,
      relativeVolume: this.relativeVolume(input.candles),
    };

    const detectors = input.only
      ? input.only.map((p) => this.registry.resolve(p))
      : this.registry.all();

    const patterns: DetectedPattern[] = [];

    for (const detector of detectors) {
      /*
       * A detector that cannot possibly find its pattern is SKIPPED, not failed.
       *
       * Asking for a double top on 12 candles is not an error — it is a question
       * with no answer, and the honest response is "nothing found". Throwing would
       * make the caller handle an exception for the entirely normal case of a young
       * market.
       */
      if (input.candles.length < detector.minimumCandles) continue;
      if (sequence.all.length < detector.minimumSwings) continue;

      try {
        for (const found of detector.detect(context)) {
          /*
           * VALIDATED AGAINST THE CONTRACT BEFORE IT LEAVES.
           *
           * A detector that reports a break of structure at quality 0.8, or a
           * pattern that completed before it began, is caught HERE — not by a
           * strategy that would happily trade on it. The schema's refinements are
           * the last line of defence and they cost microseconds.
           */
          const parsed = detectedPatternSchema.safeParse(found);

          if (!parsed.success) {
            this.failures++;
            this.logger.error(
              {
                pattern: detector.pattern,
                symbol: input.symbol,
                issues: parsed.error.issues.map((i) => i.message),
              },
              "A detector produced a pattern that violates the contract — DISCARDED",
            );
            continue;
          }

          patterns.push(parsed.data);
        }
      } catch (error) {
        // One broken detector must not blind the other twenty-three.
        this.failures++;
        this.logger.error(
          { detector: detector.pattern, symbol: input.symbol, err: error },
          "A pattern detector threw — the rest continue",
        );
      }
    }

    const result = {
      pair: input.symbol,
      timeframe: input.timeframe,
      patterns,
      zones,
      structure,
    };

    await this.cache.set(
      { symbol: input.symbol, timeframe: input.timeframe, strength, lastClosedBar },
      result,
    );

    this.publish(input.symbol, result);
    this.record(started, patterns.length);

    return result;
  }

  /* ── Events ──────────────────────────────────────────────────────── */

  private publish(
    symbol: string,
    result: { patterns: DetectedPattern[]; structure: MarketStructure; timeframe: Timeframe },
  ): void {
    for (const pattern of result.patterns) {
      this.events.emit("pattern.detected", {
        symbol,
        timeframe: result.timeframe,
        pattern: pattern.pattern,
        quality: pattern.quality,
        direction: pattern.direction,
      });
    }

    /*
     * The two structural events get their own channels, because they are the ones
     * anything downstream will actually want to WAKE UP for. A change of character
     * is the earliest warning a trend is ending, and burying it inside a generic
     * "patterns changed" event would mean the platform learns about it only when
     * something happens to ask.
     */
    if (result.structure.brokeStructure) {
      this.events.emit("structure.break", {
        symbol,
        timeframe: result.timeframe,
        trend: result.structure.trend,
      });
    }

    if (result.structure.changedCharacter) {
      this.events.emit("structure.changed", {
        symbol,
        timeframe: result.timeframe,
        trend: result.structure.trend,
      });
    }

    const sweep = result.patterns.find((p) => p.pattern === "LIQUIDITY_SWEEP");
    if (sweep) {
      this.events.emit("liquidity.sweep", {
        symbol,
        timeframe: result.timeframe,
        direction: sweep.direction,
        quality: sweep.quality,
      });
    }
  }

  /* ── Validation ──────────────────────────────────────────────────── */

  /**
   * The same absolute rule as the Indicator Engine: **no forming candles.**
   *
   * A pattern "completed" on a bar that is still moving is a pattern that may yet
   * un-complete. Its high can still rise; the flag that broke out can still close
   * back inside. Detecting on a forming bar is look-ahead bias, and it backtests
   * beautifully.
   */
  private assertUsable(candles: readonly Candle[], timeframe: Timeframe): void {
    if (candles.length === 0) {
      throw new Error("Cannot detect patterns in an empty candle series");
    }

    const last = candles.at(-1)!;
    const barMs = timeframeMs(timeframe);

    if (last.time + barMs > Date.now()) {
      throw new Error(
        `The last candle (${new Date(last.time).toISOString()}) has not CLOSED — ` +
          `detecting a pattern on a forming bar is look-ahead bias`,
      );
    }

    for (let i = 1; i < candles.length; i++) {
      if (candles[i].time <= candles[i - 1].time) {
        throw new Error(
          "The candle series is out of order or contains duplicates — every swing computed from it would be wrong",
        );
      }
    }
  }

  /**
   * Volume relative to its own 20-bar average.
   *
   * Relative, never absolute: "2× its own average" means the same thing on BTC and
   * on a microcap, while "500 units" means nothing on either.
   */
  private relativeVolume(candles: readonly Candle[]): (number | null)[] {
    const period = 20;

    return candles.map((candle, i) => {
      if (i < period) return null;

      let sum = 0;
      for (let j = i - period; j < i; j++) sum += candles[j].volume;

      const average = sum / period;
      if (average <= 0) return null; // a dead market has no "normal" to compare to

      return candle.volume / average;
    });
  }

  /* ── Health ──────────────────────────────────────────────────────── */

  metrics() {
    return {
      detections: this.detections,
      failures: this.failures,
      averageLatencyMs:
        this.detections === 0 ? 0 : this.totalLatencyMs / this.detections,
      patternsFound: this.patternsFound,
      averagePatternsPerScan:
        this.detections === 0 ? 0 : this.patternsFound / this.detections,
      cache: this.cache.stats(),
      detectors: this.registry.all().length,
    };
  }

  private record(started: number, found: number): void {
    this.detections++;
    this.totalLatencyMs += Date.now() - started;
    this.patternsFound += found;
  }
}
