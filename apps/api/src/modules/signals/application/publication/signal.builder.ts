import { Injectable } from "@nestjs/common";
import {
  publishedSignalSchema,
  type ConfluenceReport,
  type PublishedSignal,
  type SignalScore,
} from "@aegis/contracts";
import type { SignalCandidate } from "../../domain/intake";
import type { SignalPolicy } from "../../signal.policy";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * A fused opportunity: one primary candidate, plus every OTHER strategy that
 * independently agreed on the same trade. Length-1 agreement is the common case.
 */
export interface FusedOpportunity {
  readonly primary: SignalCandidate;
  readonly agreeing: readonly SignalCandidate[];
}

/**
 * Assembles the PublishedSignal — the platform's single output.
 *
 * ── It builds; it does not decide, and it does not compute ──
 *
 * Every value in the finished signal was produced by an engine that owns it: the
 * entry, stop and targets by the Strategy Evaluator and approved by the Risk
 * Engine; the leverage and market type by the Risk Engine; the confidence by the
 * Confidence Engine; the confluence by this module's own agreement measure. The
 * builder copies them into one shape. It never recomputes a price, a stop, or a
 * probability — if it did, the signal a trader acts on would disagree with the
 * evidence that justified it.
 *
 * The id is DETERMINISTIC — derived from the opportunity, not generated. The same
 * bar always yields the same id, which is what makes the pipeline idempotent and a
 * replay reproducible.
 */
@Injectable()
export class SignalBuilder {
  build(input: {
    opportunity: FusedOpportunity;
    confluence: ConfluenceReport;
    score: SignalScore;
    isPrime: boolean;
    whyPublished: string;
    supporting: string[];
    contradicting: string[];
    unassessed: string[];
    policy: SignalPolicy;
    now: number;
  }): PublishedSignal {
    const { opportunity, confluence, score, policy, now } = input;
    const primary = opportunity.primary;
    const candidate = primary.candidate;
    const risk = primary.risk;

    const strategies = [
      candidate.strategyId,
      ...opportunity.agreeing.map((a) => a.candidate.strategyId),
    ];
    const rulesHashes = [
      candidate.rulesHash,
      ...opportunity.agreeing.map((a) => a.candidate.rulesHash),
    ];

    /*
     * Execution guidance comes STRAIGHT from the Risk Engine — the only engine
     * allowed to decide market type, leverage and the stop it approved. The
     * builder does not size the trade or choose the leverage; it reads the
     * decision. Spot carries null leverage, which the contract enforces.
     */
    const marketType = risk.marketType ?? candidate.market;
    const suggestedLeverage =
      marketType === "PERPETUAL" ? (risk.leverage?.suggested ?? null) : null;

    const barMs = timeframeMs(candidate.timeframe);

    const signal = {
      id: signalId({
        symbol: candidate.symbol,
        direction: candidate.direction,
        timeframe: candidate.timeframe,
        barTime: candidate.barTime,
        strategies,
      }),

      symbol: candidate.symbol,
      exchange: candidate.exchange,
      timeframe: candidate.timeframe,
      direction: candidate.direction,

      strategies,
      rulesHashes,
      regime: candidate.regime,

      marketType,
      suggestedLeverage,
      entryPrice: candidate.entryPrice,
      /* The stop the Risk Engine APPROVED — it vetoes bad stops, it never moves them. */
      stopLoss: candidate.proposedStop,
      takeProfits: candidate.proposedTargets,

      confidence: primary.confidence.confidence,
      confluence,
      signalScore: score,

      isPrime: input.isPrime,

      status: "ACTIVE" as const,
      barTime: candidate.barTime,
      publishedAt: now,
      /*
       * The setup expires when it has aged past the freshness window. A signal
       * must never outlive the conditions that created it, so its death is set at
       * birth rather than left to a sweep that might run late.
       */
      expiresAt: candidate.barTime + barMs * (policy.maximumAgeBars + 2),

      summary: summarise(strategies, candidate),
      whyPublished: input.whyPublished,
      supporting: input.supporting,
      contradicting: input.contradicting,
      unassessed: input.unassessed,

      calibrationVersion: primary.confidence.calibrationVersion,
    };

    /* Parsed on the way out — the contract is enforced, never merely intended. */
    return publishedSignalSchema.parse(signal);
  }
}

/**
 * The deterministic id.
 *
 * Strategies are SORTED before hashing, so a confluence of {breakout,
 * level-bounce} produces the same id however the two arrived — order of discovery
 * must not change identity, or the same fused opportunity could publish twice.
 */
export function signalId(input: {
  symbol: string;
  direction: string;
  timeframe: string;
  barTime: number;
  strategies: readonly string[];
}): string {
  const sorted = [...input.strategies].sort().join("+");
  return `sig:${input.symbol}:${input.timeframe}:${input.direction}:${input.barTime}:${fnv(sorted)}`;
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function summarise(
  strategies: readonly string[],
  candidate: { direction: string; symbol: string; timeframe: string },
): string {
  const who =
    strategies.length === 1
      ? strategies[0]
      : `${strategies.length} strategies (${strategies.join(", ")})`;
  return `${candidate.direction} ${candidate.symbol} on the ${candidate.timeframe} — ${who}`;
}
