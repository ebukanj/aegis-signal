import type {
  CandidateSignal,
  Candle,
  DetectedPattern,
  MarketContext,
  OrderBookSummary,
  RejectionGate,
  RiskLevel,
  StrategyDefinition,
  Ticker,
  Zone,
} from "@aegis/contracts";
import type { ExchangeHealth } from "../../market/domain/exchange-adapter.interface";
import type { Maybe } from "../../indicators/application/math/rolling";
import type { RiskPolicy } from "../risk.policy";

/**
 * Everything a risk gate is allowed to look at.
 *
 * Assembled once, frozen, and handed to every validator. No gate fetches anything, and
 * none of them can: a gate that could reach out mid-pipeline would be judging a market
 * that had moved since the gate before it, and two gates would be vetoing (or approving)
 * two different instants.
 */
export interface RiskContext {
  readonly candidate: CandidateSignal;
  readonly strategy: StrategyDefinition;
  readonly policy: RiskPolicy;

  readonly candles: readonly Candle[];
  readonly indicators: Readonly<Record<string, readonly Maybe[]>>;
  readonly patterns: readonly DetectedPattern[];
  readonly zones: readonly Zone[];
  readonly market: MarketContext;

  /**
   * Live market microstructure. **Nullable, and the null is a veto, not a shrug.**
   *
   * If the platform cannot see the book, it cannot see the spread — and it must not
   * approve a trade whose profit may already have been eaten by a spread it never
   * looked at. This is data that SHOULD be there; absent, it is a risk signal in
   * itself.
   */
  readonly book: OrderBookSummary | null;
  readonly ticker: Ticker | null;
  readonly exchange: ExchangeHealth | null;

  /** Correlation of this symbol's returns against BTC. Null when uncomputable. */
  readonly btcCorrelation: number | null;

  /** Now, injected — so a replay is reproducible and does not depend on the clock. */
  readonly now: number;
}

/**
 * One gate's verdict.
 *
 * ── There are only three, and there is no "probably fine" ──
 *
 * The Risk Engine produces DECISIONS, not probabilities. A gate either vetoes, or it
 * passes with a measurement, or it declares it could not look. There is no fourth
 * option, and the absence of one is the design: a gate allowed to be *slightly* unhappy
 * would eventually be *slightly* unhappy about everything, and a stream of soft
 * misgivings is not a veto — it is noise a trader learns to ignore.
 */
export type Verdict =
  | {
      kind: "PASS";
      /** What was measured. "spread 0.031%", never "spread is fine". */
      measured: string;
      rating: RiskLevel;
      /** Non-fatal, but the trader must see it. "ATR is 2.1× its recent normal." */
      warning?: string;
    }
  | {
      kind: "VETO";
      gate: RejectionGate;
      /**
       * The measurement AND the limit. "spread 0.081% > 0.05% limit".
       *
       * A rejection without a number is not evidence. "Rejected" tells a trader nothing
       * and is indistinguishable from a broken engine; a measured reason tells them the
       * machine looked, and that the machine was right. **This is what makes a quiet day
       * credible instead of suspicious** (AGENTS.md §1).
       */
      reason: string;
    }
  | {
      kind: "UNASSESSED";
      /**
       * The feed does not exist yet. This does NOT veto — see `RiskAssessment.unassessed`.
       *
       * But it must never read as clean. It is named, in plain English, and travels with
       * the decision to the trader: *"nobody checked whether CPI prints in ten minutes."*
       */
      reason: string;
    };

/**
 * One gate.
 *
 * Pure: context in, verdict out. No fetching, no clock, no state. That is what makes a
 * risk decision reproducible — and a decision that cannot be reproduced cannot be
 * audited, which for a veto is the whole point.
 */
export interface IRiskValidator {
  /** "liquidity", "spread", "volatility". Appears in the assessment verbatim. */
  readonly name: string;

  /**
   * Weight in the aggregate risk score, 0–1. Zero means "this gate vetoes or it does
   * not, but it does not colour the score".
   */
  readonly weight: number;

  validate(context: RiskContext): Verdict;
}
