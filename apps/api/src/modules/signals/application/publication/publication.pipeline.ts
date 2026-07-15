import { Injectable } from "@nestjs/common";
import type {
  PublicationDecision,
  PublishedSignal,
  RejectionGate,
} from "@aegis/contracts";

import { DEFAULT_SIGNAL_POLICY, type SignalPolicy } from "../../signal.policy";
import { assertComplete, type SignalCandidate } from "../../domain/intake";
import { ConfluenceEngine } from "../confluence/confluence.engine";
import { RankingEngine } from "../ranking/ranking.engine";
import { FreshnessService } from "../freshness/freshness.service";
import {
  DeduplicationService,
  type OpportunityKey,
} from "../deduplication/deduplication.service";
import {
  PrimeBudgetManager,
  type BudgetLedger,
  type PrimeContender,
} from "../budget/prime-budget.manager";
import { buildExplanation } from "./explanation.builder";
import {
  SignalBuilder,
  signalId,
  type FusedOpportunity,
} from "./signal.builder";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/** The verdict on one fused opportunity, whether it published or was suppressed. */
export interface PipelineOutcome {
  readonly opportunity: FusedOpportunity;
  readonly decision: PublicationDecision;
  /** Present only when published. */
  readonly signal: PublishedSignal | null;
  /** Present when awarded a Prime slot. */
  readonly primeSlot: number | null;
}

/**
 * The Signal Engine, as one pure function of its inputs.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE EDITOR-IN-CHIEF — AND WHY IT IS DETERMINISTIC END TO END
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Is this one of the few opportunities worthy of interrupting the trader?" The
 * pipeline answers it in a fixed order, and the order is load-bearing:
 *
 *   1. INTAKE      — reject incomplete candidates as BUGS, loudly (not silently).
 *   2. FUSION      — group agreeing strategies into one opportunity (confluence).
 *   3. RANK        — order opportunities by the backstage quality score.
 *   4. Per opportunity, strongest first:
 *        FRESHNESS   — is it still real?
 *        DEDUP       — have we already published this?
 *        FLOORS      — confidence and confluence both above their thresholds?
 *        PUBLISH     — if all pass, it becomes a signal.
 *        PRIME       — the strongest, proven, within-budget signals are Primed.
 *
 * Everything that makes a decision is passed IN — the recent signals, the budget
 * ledger, `now`. Nothing is fetched mid-pipeline. That is what makes the whole
 * thing deterministic: the same inputs always produce the same signals, in the
 * same order, with the same Prime awards. A replay of a day reproduces that day
 * exactly, which is an acceptance criterion and also the only way the platform's
 * own history can be trusted.
 */
@Injectable()
export class PublicationPipeline {
  constructor(
    private readonly confluence: ConfluenceEngine,
    private readonly ranking: RankingEngine,
    private readonly freshness: FreshnessService,
    private readonly deduplication: DeduplicationService,
    private readonly prime: PrimeBudgetManager,
    private readonly builder: SignalBuilder,
  ) {}

  run(input: {
    candidates: readonly SignalCandidate[];
    /** Already-published opportunities to dedup against (recent feed). */
    recent: readonly OpportunityKey[];
    /** Today's Prime allocations so far. */
    ledger: BudgetLedger;
    hourStart: number;
    policy?: SignalPolicy;
  }): PipelineOutcome[] {
    const policy = input.policy ?? DEFAULT_SIGNAL_POLICY;

    /* ── 1 · Intake: incompleteness is a BUG, and it throws ────────── */
    for (const candidate of input.candidates) assertComplete(candidate);

    /* ── 2 · Fusion: agreeing strategies → one opportunity ─────────── */
    const opportunities = this.fuse(input.candidates, policy);

    /* ── 3 · Rank the opportunities (deterministically) ────────────── */
    const ranked = opportunities
      .map((opportunity) => {
        const agreeing = opportunity.agreeing.map((a) => a.candidate.strategyId);
        const confluence = this.confluence.evaluate(opportunity.primary, [
          opportunity.primary.candidate.strategyId,
          ...agreeing,
        ]);
        const score = this.ranking.score(opportunity.primary, confluence, policy);
        const id = signalId({
          symbol: opportunity.primary.candidate.symbol,
          direction: opportunity.primary.candidate.direction,
          timeframe: opportunity.primary.candidate.timeframe,
          barTime: opportunity.primary.candidate.barTime,
          strategies: [opportunity.primary.candidate.strategyId, ...agreeing],
        });
        return { opportunity, confluence, score, id };
      })
      .sort((a, b) => RankingEngine.compare(a, b));

    /* ── 4 · Decide, strongest first ───────────────────────────────── */
    const outcomes: PipelineOutcome[] = [];

    /* A mutable copy of what has been published, so dedup sees siblings decided
     * earlier THIS pass — the strongest of two duplicates wins because it is
     * considered first. */
    const seen: OpportunityKey[] = [...input.recent];

    /* A mutable budget so per-pass Prime awards accumulate against the caps. */
    let awarded = input.ledger.awarded;
    let thisHour = input.ledger.thisHour;
    const perSymbol = new Map(input.ledger.perSymbol);
    const perStrategy = new Map(input.ledger.perStrategy);

    for (const entry of ranked) {
      const { opportunity, confluence, score } = entry;
      const primary = opportunity.primary;
      const key = keyOf(opportunity);

      /* Freshness — is it still real? */
      const fresh = this.freshness.check(primary, policy);
      if (!fresh.fresh) {
        outcomes.push(suppress(opportunity, fresh.gate, fresh.reason));
        continue;
      }

      /* Deduplication — have we published this already? */
      const dupe = this.deduplication.isDuplicate(key, seen, policy);
      if (dupe.duplicate) {
        outcomes.push(suppress(opportunity, "DUPLICATE", dupe.reason));
        continue;
      }

      /* The floors. Confidence AND confluence — a well-calibrated score on
       * incoherent evidence is a coin flip wearing a track record. */
      if (primary.confidence.confidence.score < policy.publishConfidenceFloor) {
        outcomes.push(
          suppress(
            opportunity,
            "CONFIDENCE_FLOOR",
            `confidence ${primary.confidence.confidence.score} is below the publication floor of ${policy.publishConfidenceFloor} — kept in the scanner, not published`,
          ),
        );
        continue;
      }

      if (confluence.score < policy.publishConfluenceFloor) {
        outcomes.push(
          suppress(
            opportunity,
            "MARKET_CONDITION",
            `confluence ${confluence.score} is below the floor of ${policy.publishConfluenceFloor} — the evidence does not agree with itself strongly enough to interrupt a trader`,
          ),
        );
        continue;
      }

      /* ── It publishes. Now: is it Prime? ─────────────────────────── */
      const contender: PrimeContender = {
        signalId: entry.id,
        symbol: primary.candidate.symbol,
        strategies: confluence.agreeingStrategies,
        timeframe: primary.candidate.timeframe,
        score: score.total,
        confidenceScore: primary.confidence.confidence.score,
        primeEligible: primary.confidence.primeEligible,
      };

      const primeDecision = this.prime.consider(
        contender,
        { total: input.ledger.total, awarded, perSymbol, perStrategy, thisHour },
        policy,
      );

      const isPrime = primeDecision.primed;
      if (isPrime) {
        awarded += 1;
        thisHour += 1;
        perSymbol.set(contender.symbol, (perSymbol.get(contender.symbol) ?? 0) + 1);
        for (const s of contender.strategies) {
          perStrategy.set(s, (perStrategy.get(s) ?? 0) + 1);
        }
      }

      const explanation = buildExplanation({
        primary,
        confluence,
        isPrime,
        primeReason: primeDecision.reason,
        policy,
      });

      const signal = this.builder.build({
        opportunity,
        confluence,
        score,
        isPrime,
        whyPublished: explanation.whyPublished,
        supporting: explanation.supporting,
        contradicting: explanation.contradicting,
        unassessed: explanation.unassessed,
        policy,
        now: primary.now,
      });

      seen.push(key);

      outcomes.push({
        opportunity,
        decision: {
          published: true,
          isPrime,
          reason: isPrime
            ? primeDecision.reason
            : "published to the feed; not Prime — " + primeDecision.reason,
        },
        signal,
        primeSlot: isPrime ? primeDecision.slot : null,
      });
    }

    return outcomes;
  }

  /**
   * Fuse candidates that describe the SAME opportunity — same symbol, direction and
   * timeframe, on bars within the confluence window. The strongest-confidence
   * candidate in a group is the primary; the rest become agreeing strategies, and
   * the fused signal credits them all (ADR-021 §1). Strategies never talk to each
   * other; agreement is detected here, above them, and only here.
   */
  private fuse(
    candidates: readonly SignalCandidate[],
    policy: SignalPolicy,
  ): FusedOpportunity[] {
    const groups = new Map<string, SignalCandidate[]>();

    for (const candidate of candidates) {
      const c = candidate.candidate;
      const barMs = timeframeMs(c.timeframe);
      /* The window bucket: candidates within N bars share a key and thus a group. */
      const bucket = Math.floor(c.barTime / (barMs * (policy.confluenceWindowBars + 1)));
      const key = `${c.symbol}:${c.direction}:${c.timeframe}:${bucket}`;

      const list = groups.get(key);
      if (list) list.push(candidate);
      else groups.set(key, [candidate]);
    }

    const opportunities: FusedOpportunity[] = [];

    for (const list of groups.values()) {
      /* One candidate per STRATEGY in a group — a strategy firing twice in the
       * window is not confluence with itself; keep its stronger candidate. */
      const byStrategy = new Map<string, SignalCandidate>();
      for (const candidate of list) {
        const id = candidate.candidate.strategyId;
        const existing = byStrategy.get(id);
        if (
          !existing ||
          candidate.confidence.confidence.score > existing.confidence.confidence.score
        ) {
          byStrategy.set(id, candidate);
        }
      }

      const members = [...byStrategy.values()].sort(
        (a, b) =>
          b.confidence.confidence.score - a.confidence.confidence.score ||
          (a.candidate.id < b.candidate.id ? -1 : 1),
      );

      opportunities.push({ primary: members[0], agreeing: members.slice(1) });
    }

    return opportunities;
  }
}

function keyOf(opportunity: FusedOpportunity): OpportunityKey {
  const c = opportunity.primary.candidate;
  return {
    symbol: c.symbol,
    direction: c.direction,
    timeframe: c.timeframe,
    entryPrice: c.entryPrice,
    barTime: c.barTime,
  };
}

function suppress(
  opportunity: FusedOpportunity,
  gate: RejectionGate,
  reason: string,
): PipelineOutcome {
  return {
    opportunity,
    decision: { published: false, gate, reason },
    signal: null,
    primeSlot: null,
  };
}
