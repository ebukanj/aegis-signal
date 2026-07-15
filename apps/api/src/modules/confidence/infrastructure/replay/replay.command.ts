import { Injectable, Logger } from "@nestjs/common";
import type { Candle, LabelledSetup, StrategyDefinition, Timeframe } from "@aegis/contracts";

import { MarketService } from "../../../market/application/market.service";
import { DependencyResolver } from "../../../strategy/application/resolver/dependency.resolver";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";
import { StrategyRepository } from "../../../strategy/infrastructure/strategy.repository";
import { CalibrationRepository } from "../repository/calibration.repository";
import { CalibrationService } from "../../application/services/calibration.service";
import { ConfidenceService } from "../../application/services/confidence.service";
import { ReplayRunner } from "./replay.runner";
import { DEFAULT_CONFIDENCE_POLICY, type ConfidencePolicy } from "../../confidence.policy";

/**
 * The calibration job — the background process the user never operates.
 *
 * ADR-024 §2 is precise about what this is and what it is not. It is NOT the
 * Backtesting Laboratory that ADR-023 deleted; there is no page, no controls, no
 * parameter sweep, and there never will be. Traders validate in TradingView.
 *
 * It exists for exactly one reason: **so that the number on a signal means
 * something on day one**, instead of a new user staring at "UNCALIBRATED" for six
 * weeks and learning nothing.
 */
@Injectable()
export class ReplayCommand {
  private readonly logger = new Logger(ReplayCommand.name);

  constructor(
    private readonly market: MarketService,
    private readonly strategies: StrategyRepository,
    private readonly resolver: DependencyResolver,
    private readonly runner: ReplayRunner,
    private readonly repository: CalibrationRepository,
    private readonly calibration: CalibrationService,
    private readonly confidence: ConfidenceService,
  ) {}

  /**
   * Replay the corpus, label every setup, fit the model, ship the best.
   */
  async run(input: {
    symbols: readonly string[];
    /**
     * How much history, expressed in bars of the FINEST timeframe.
     *
     * The other timeframes are fetched to cover the same SPAN of time, not the
     * same number of bars — 17,520 daily candles would be forty-eight years, which
     * Bitcoin does not have and no altcoin has any of.
     */
    bars: number;
    policy?: ConfidencePolicy;
  }): Promise<void> {
    const policy = input.policy ?? DEFAULT_CONFIDENCE_POLICY;
    const enabled = this.strategies.all().filter((s) => s.enabled);

    /*
     * ── Every timeframe the documents actually name ─────────────────
     *
     * Not a guess, and not a constant. The strategies are DOCUMENTS: what they
     * depend on is read out of them.
     *
     * The first version of this replay hardcoded 1h and produced zero setups from
     * 17,520 candles, because every one of the six also reads a higher timeframe
     * (and Level Bounce lives on the 15m). A replay of a system you are not running
     * produces a number about nothing.
     */
    const timeframes = new Set<Timeframe>();

    for (const strategy of enabled) {
      for (const tf of this.resolver.resolve(strategy).timeframes) timeframes.add(tf);
      timeframes.add(strategy.timeframe);
    }

    const ordered = [...timeframes].sort((a, b) => timeframeMs(a) - timeframeMs(b));
    const finest = ordered[0];
    const span = timeframeMs(finest) * input.bars;

    this.logger.log(
      `Replaying ${enabled.length} strategies over ${input.symbols.length} symbols. ` +
        `Timeframes the documents demand: ${ordered.join(", ")} — covering ${(span / 86_400_000 / 365).toFixed(1)} years`,
    );

    /* ── Fetch first, so the split is computed over the WHOLE corpus ── */

    const histories = new Map<
      string,
      Partial<Record<Timeframe, readonly Candle[]>>
    >();

    for (const symbol of input.symbols) {
      const byTimeframe: Partial<Record<Timeframe, readonly Candle[]>> = {};

      for (const tf of ordered) {
        /* The same SPAN of time on every timeframe, never the same bar count. */
        const bars = Math.ceil(span / timeframeMs(tf));

        byTimeframe[tf] = await this.market.history({
          symbol,
          timeframe: tf,
          bars,
        });
      }

      histories.set(symbol, byTimeframe);

      this.logger.log(
        `${symbol}: ${ordered.map((tf) => `${byTimeframe[tf]?.length ?? 0}×${tf}`).join(" · ")}`,
      );
    }

    /*
     * ── The walk-forward split ──────────────────────────────────────
     *
     * A single point in TIME, shared by every symbol — not a per-symbol 70% of
     * rows.
     *
     * The difference matters more than it looks. Splitting each symbol's rows
     * independently would put March 2025 into BTC's validation half and into ETH's
     * calibration half, and the model would be fitted on one asset's future while
     * being graded on another's — which leaks, because crypto assets move together.
     * The correct boundary is a DATE: everything before it is used to fit,
     * everything after it is used to grade, for every symbol at once.
     */
    /*
     * A STREAMING min/max, not `Math.min(...allTimes)`.
     *
     * This crashed on the first full run: ten symbols × four timeframes is roughly
     * 1.6 MILLION timestamps, and spreading that many arguments onto the call stack
     * throws `RangeError: Maximum call stack size exceeded`. The spread operator is
     * a function call, and a function call has an argument limit. A reduce has none.
     */
    let from = Number.POSITIVE_INFINITY;
    let to = Number.NEGATIVE_INFINITY;

    for (const byTf of histories.values()) {
      for (const candles of Object.values(byTf)) {
        for (const candle of candles) {
          if (candle.time < from) from = candle.time;
          if (candle.time > to) to = candle.time;
        }
      }
    }

    const splitAt = from + (to - from) * policy.calibrationSplit;

    this.logger.log(
      `Walk-forward boundary: ${new Date(splitAt).toISOString().slice(0, 10)} — ` +
        `everything before it FITS the model, everything after GRADES it`,
    );

    /* ── Replay ──────────────────────────────────────────────────── */

    const all: LabelledSetup[] = [];

    for (const [symbol, candlesByTimeframe] of histories) {
      const setups = await this.runner.run({
        strategies: enabled as StrategyDefinition[],
        symbol,
        exchange: "BINANCE",
        candlesByTimeframe,
        policy,
        splitAt,
      });

      all.push(...setups);
    }

    if (all.length === 0) {
      this.logger.warn(
        "The replay produced ZERO setups. Either the strategies fire very rarely, or the risk gates refuse everything. Either way there is nothing to calibrate, and the platform will continue to report UNCALIBRATED — which is the honest outcome, not a bug to be worked around by loosening a threshold.",
      );
      return;
    }

    await this.repository.saveSetups(all);
    await this.calibration.fit(all, policy);
    await this.confidence.reload();
  }
}
