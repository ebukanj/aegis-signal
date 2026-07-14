import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  CandidateSignal,
  Candle,
  DetectedPattern,
  MarketContext,
  OrderBookSummary,
  RiskDecision,
  StrategyDefinition,
  Ticker,
  Zone,
} from "@aegis/contracts";
import { RiskPipeline } from "./risk.pipeline";
import {
  assertPolicyCoherent,
  DEFAULT_RISK_POLICY,
  type RiskPolicy,
} from "../../risk.policy";
import type { RiskContext } from "../../domain/validator";
import type { ExchangeHealth } from "../../../market/domain/exchange-adapter.interface";
import type { Maybe } from "../../../indicators/application/math/rolling";

/**
 * The Risk Engine's front door.
 *
 * It does not search for trades. It does not modify strategies, adjust confidence, or
 * change entries. It answers exactly one question:
 *
 *     "Is this trade acceptable?"
 *
 * And its answer is final. **If it says no, the platform says no**, and nothing
 * downstream may overrule it.
 */
@Injectable()
export class RiskService implements OnModuleInit {
  private readonly logger = new Logger(RiskService.name);

  private policy: RiskPolicy = DEFAULT_RISK_POLICY;

  private decisions = 0;
  private approvals = 0;
  private rejections = 0;
  private totalScore = 0;
  private totalLatencyMs = 0;

  /** WHY trades are being refused. The most useful number in the admin console. */
  private readonly gateCounts = new Map<string, number>();

  constructor(
    private readonly pipeline: RiskPipeline,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    /*
     * A policy that contradicts itself produces decisions that are individually
     * defensible and collectively impossible — every candidate rejected, for a reason
     * nobody could ever find. Checked at boot, where it is free.
     */
    assertPolicyCoherent(this.policy);

    this.logger.log(
      {
        minimumRiskReward: this.policy.minimumRiskReward,
        maximumSpreadPercent: this.policy.maximumSpreadPercent,
        minimumVolumeUsd: this.policy.minimumVolumeUsd,
        referenceEquity: this.policy.accountEquity,
      },
      "Risk policy loaded — every limit is here, and none is hardcoded in a validator",
    );
  }

  /** Hot-swap the policy. Validated first: an incoherent one is never installed. */
  setPolicy(policy: RiskPolicy): void {
    assertPolicyCoherent(policy);

    this.policy = policy;
    this.events.emit("risk.policy.changed", { policy });
  }

  currentPolicy(): RiskPolicy {
    return this.policy;
  }

  /* ── The decision ────────────────────────────────────────────────── */

  validate(input: {
    candidate: CandidateSignal;
    strategy: StrategyDefinition;
    candles: readonly Candle[];
    indicators: Readonly<Record<string, readonly Maybe[]>>;
    patterns: readonly DetectedPattern[];
    zones: readonly Zone[];
    market: MarketContext;
    book: OrderBookSummary | null;
    ticker: Ticker | null;
    exchange: ExchangeHealth | null;
    btcCorrelation: number | null;
    /** Injected, so a replay is reproducible and does not depend on the wall clock. */
    now?: number;
  }): RiskDecision {
    const started = Date.now();

    const context: RiskContext = Object.freeze({
      ...input,
      policy: this.policy,
      now: input.now ?? Date.now(),
    });

    const decision = this.pipeline.decide(context);

    this.decisions++;
    this.totalLatencyMs += Date.now() - started;

    if (decision.approved) {
      this.approvals++;
      this.totalScore += decision.assessment?.score ?? 0;

      this.events.emit("risk.approved", {
        candidateId: input.candidate.id,
        symbol: input.candidate.symbol,
        score: decision.assessment?.score,
        leverage: decision.leverage?.suggested ?? null,
      });

      this.logger.log(
        {
          candidate: input.candidate.id,
          score: decision.assessment?.score,
          level: decision.assessment?.level,
          warnings: decision.assessment?.warnings.length ?? 0,
          unassessed: decision.assessment?.unassessed.length ?? 0,
        },
        "APPROVED",
      );
    } else {
      this.rejections++;

      const gate = decision.gate!;
      this.gateCounts.set(gate, (this.gateCounts.get(gate) ?? 0) + 1);

      this.events.emit("risk.rejected", {
        candidateId: input.candidate.id,
        symbol: input.candidate.symbol,
        gate,
        reason: decision.reason,
      });

      this.logger.log(
        { candidate: input.candidate.id, gate, reason: decision.reason },
        "VETOED",
      );
    }

    return decision;
  }

  /* ── Correlation ─────────────────────────────────────────────────── */

  /**
   * Pearson correlation of this symbol's RETURNS against BTC's.
   *
   * ── Returns, never prices ──
   *
   * Two assets in long uptrends have correlated *prices* almost by definition — both
   * numbers go up, and the correlation coefficient comes out near 1 whether or not they
   * have anything to do with each other. It is a famous statistical trap and it produces a
   * number that is impressive and meaningless.
   *
   * What matters is whether they move together *bar to bar*: when BTC drops 3%, does this
   * drop too? That is a question about returns, and it is the question a trader is actually
   * asking when they wonder whether their five positions are really one position.
   *
   * Returns null when the series cannot be aligned — and null is honest. A fabricated
   * correlation would let a trader believe a position was independent when nobody had
   * checked.
   */
  correlation(symbol: readonly Candle[], btc: readonly Candle[]): number | null {
    const length = Math.min(symbol.length, btc.length);
    if (length < 30) return null;

    const a = returns(symbol.slice(-length));
    const b = returns(btc.slice(-length));

    if (a.length !== b.length || a.length < 20) return null;

    const meanA = a.reduce((s, x) => s + x, 0) / a.length;
    const meanB = b.reduce((s, x) => s + x, 0) / b.length;

    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;

    for (let i = 0; i < a.length; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;

      covariance += da * db;
      varianceA += da * da;
      varianceB += db * db;
    }

    // A flat series has no variance and therefore no correlation with anything. Returning
    // 0 would claim independence, which is a statement we have not earned.
    if (varianceA <= 0 || varianceB <= 0) return null;

    return covariance / Math.sqrt(varianceA * varianceB);
  }

  /* ── Health ──────────────────────────────────────────────────────── */

  metrics() {
    return {
      decisions: this.decisions,
      approvals: this.approvals,
      rejections: this.rejections,

      /**
       * The approval rate — and it SHOULD be low.
       *
       * A risk engine approving most of what it sees is not a risk engine, it is a
       * rubber stamp. "A missed trade is acceptable; a bad trade is not" means the
       * expected shape of this number is small, and a RISING approval rate is a warning
       * rather than a win.
       */
      approvalRate: this.decisions === 0 ? 0 : this.approvals / this.decisions,

      averageRiskScore: this.approvals === 0 ? 0 : this.totalScore / this.approvals,
      averageLatencyMs:
        this.decisions === 0 ? 0 : this.totalLatencyMs / this.decisions,

      /** WHICH gate is doing the refusing. */
      rejectionsByGate: [...this.gateCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([gate, count]) => ({ gate, count })),

      policy: this.policy,
    };
  }
}

/** Bar-to-bar percentage returns. */
function returns(candles: readonly Candle[]): number[] {
  const out: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1].close;
    if (previous <= 0) continue;

    out.push((candles[i].close - previous) / previous);
  }

  return out;
}
