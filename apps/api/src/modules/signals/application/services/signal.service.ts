import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomUUID } from "node:crypto";
import {
  EVENT,
  type PublishedSignal,
  type SignalStatus,
} from "@aegis/contracts";

import {
  DEFAULT_SIGNAL_POLICY,
  assertSignalPolicyCoherent,
  type SignalPolicy,
} from "../../signal.policy";
import type { SignalCandidate } from "../../domain/intake";
import { IncompleteCandidateError } from "../../domain/intake";
import {
  PublicationPipeline,
  type PipelineOutcome,
} from "../publication/publication.pipeline";
import { LifecycleManager } from "../lifecycle/lifecycle.manager";
import { SignalRepository } from "../../infrastructure/repository/signal.repository";
import type { OpportunityKey } from "../deduplication/deduplication.service";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * The Signal Engine's front door — the Editor-in-Chief.
 *
 * The upstream engines answer *does the setup exist / is it acceptable / how much
 * trust has it earned?* This asks the last question — *is it one of the few worth
 * interrupting the trader for?* — and it is the only engine allowed to publish.
 *
 * Its job is selection, not analysis, and most of the time its answer is **no**.
 * Silence is a feature; a day with zero signals is a successful day if the evidence
 * produced none (AGENTS.md §1). What this engine guarantees is that the silence,
 * and every rare exception to it, can explain itself.
 */
@Injectable()
export class SignalService implements OnModuleInit {
  private readonly logger = new Logger(SignalService.name);
  private readonly policy: SignalPolicy = DEFAULT_SIGNAL_POLICY;

  private published = 0;
  private suppressed = 0;
  private primed = 0;
  private readonly suppressionGates = new Map<string, number>();

  constructor(
    private readonly pipeline: PublicationPipeline,
    private readonly lifecycle: LifecycleManager,
    private readonly repository: SignalRepository,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    /* A self-contradicting policy would suppress everything for a reason nobody
     * could find. Refused at boot, like the Risk and Confidence policies. */
    assertSignalPolicyCoherent(this.policy);
  }

  /**
   * The publication pass. Takes a batch of complete candidates (each already
   * risk-approved and confidence-scored), decides which become signals, persists
   * them, and awards the day's Prime slots.
   *
   * Everything the pipeline needs to be deterministic is gathered HERE and passed
   * in — the recent feed, the budget ledger, the clock. The pipeline itself
   * touches no I/O, so a replay of the same batch reproduces the same signals.
   */
  async publish(candidates: readonly SignalCandidate[]): Promise<PipelineOutcome[]> {
    if (candidates.length === 0) return [];

    const now = candidates[0].now;
    const day = new Date(now).toISOString().slice(0, 10);
    const hourStart = now - (now % 3_600_000);

    /* Dedup against the recent feed — a wide-enough window to catch a setup that
     * re-fires across a few bars. */
    const lookback = now - timeframeMs("1d");
    const recentSignals = await this.repository.recent({ since: lookback, limit: 500 });
    const recent: OpportunityKey[] = recentSignals.map((s) => ({
      symbol: s.symbol,
      direction: s.direction,
      timeframe: s.timeframe,
      entryPrice: s.entryPrice,
      barTime: s.barTime,
    }));

    const ledger = await this.repository.budgetLedger(
      day,
      this.policy.primeBudget.perDay,
      hourStart,
    );

    let outcomes: PipelineOutcome[];
    try {
      outcomes = this.pipeline.run({ candidates, recent, ledger, hourStart, policy: this.policy });
    } catch (error) {
      if (error instanceof IncompleteCandidateError) {
        /* A pipeline bug, not a market rejection — surfaced, never swallowed. */
        this.logger.error(error.message);
      }
      throw error;
    }

    for (const outcome of outcomes) {
      await this.commit(outcome, day, now);
    }

    const publishedCount = outcomes.filter((o) => o.decision.published).length;
    this.logger.log(
      `Publication pass: ${candidates.length} candidate(s) → ${publishedCount} published, ` +
        `${outcomes.length - publishedCount} suppressed, ${outcomes.filter((o) => o.primeSlot !== null).length} Prime`,
    );

    return outcomes;
  }

  private async commit(outcome: PipelineOutcome, day: string, now: number): Promise<void> {
    const primary = outcome.opportunity.primary.candidate;
    const pair = `${primary.symbol}USDT`;

    if (!outcome.decision.published || !outcome.signal) {
      this.suppressed += 1;
      const gate = outcome.decision.published ? "?" : outcome.decision.gate;
      this.suppressionGates.set(gate, (this.suppressionGates.get(gate) ?? 0) + 1);

      this.events.emit(EVENT.SIGNAL_SUPPRESSED, {
        name: EVENT.SIGNAL_SUPPRESSED,
        eventId: randomUUID(),
        correlationId: randomUUID(),
        occurredAt: new Date(now).toISOString(),
        pair,
        strategies: [primary.strategyId],
        gate,
        reason: outcome.decision.published ? "" : outcome.decision.reason,
      });
      return;
    }

    const signal = outcome.signal;
    const { created } = await this.repository.publish(signal);

    /* Idempotent: a re-published opportunity is a no-op and emits nothing. */
    if (!created) return;

    this.published += 1;

    if (outcome.primeSlot !== null) {
      this.primed += 1;
      await this.repository.awardPrime({
        day,
        slot: outcome.primeSlot,
        signalId: signal.id,
        symbol: signal.symbol,
        score: signal.signalScore.total,
        awardedAt: now,
      });

      this.events.emit(EVENT.PRIME_SELECTED, {
        name: EVENT.PRIME_SELECTED,
        eventId: randomUUID(),
        correlationId: randomUUID(),
        occurredAt: new Date(now).toISOString(),
        signalId: signal.id,
        pair,
        confidence: signal.confidence.score,
        slot: outcome.primeSlot,
        budgetTotal: this.policy.primeBudget.perDay,
      });
    }

    this.events.emit(EVENT.SIGNAL_PUBLISHED, {
      name: EVENT.SIGNAL_PUBLISHED,
      eventId: randomUUID(),
      correlationId: randomUUID(),
      occurredAt: new Date(now).toISOString(),
      signalId: signal.id,
      pair,
      strategies: signal.strategies,
      isPrime: signal.isPrime,
      signalScore: signal.signalScore.total,
      confidence: signal.confidence.score,
    });
  }

  /* ── Lifecycle ─────────────────────────────────────────────────── */

  /**
   * Advance a published signal. The valid moves are enforced by the
   * LifecycleManager, and every move is appended to the audit trail — a terminal
   * state (COMPLETED/STOPPED/EXPIRED) can never be left, because a settled outcome
   * is a matter of record.
   */
  async advance(
    signalId: string,
    to: SignalStatus,
    reason: string,
    at: number,
  ): Promise<void> {
    const signal = await this.repository.byId(signalId);
    if (!signal) throw new Error(`No such signal: ${signalId}`);

    const transition = this.lifecycle.transition(signalId, signal.status, to, reason, at);
    await this.repository.applyTransition(signalId, transition);
  }

  async byId(id: string): Promise<PublishedSignal | null> {
    return this.repository.byId(id);
  }

  async active(now: number): Promise<PublishedSignal[]> {
    const since = now - timeframeMs("1d") * 7;
    return this.repository.recent({ since, statuses: ["ACTIVE", "TRIGGERED"], limit: 200 });
  }

  /* ── Administration ────────────────────────────────────────────── */

  async metrics(): Promise<Record<string, unknown>> {
    const byStatus = await this.repository.countByStatus();

    return {
      publishedThisRun: this.published,
      suppressedThisRun: this.suppressed,
      primedThisRun: this.primed,
      suppressionGates: Object.fromEntries(this.suppressionGates),
      byStatus,
      primeBudgetPerDay: this.policy.primeBudget.perDay,
      /*
       * Stated plainly, because it is the single most important fact about Prime
       * today and it must not surprise an operator watching the budget go unspent.
       */
      primeNote:
        "Prime awards 0 until a strategy is PROVEN (has a settled live record). No signal has settled yet, so nothing is Prime — this is correct (ADR-023 §4), not a fault.",
    };
  }
}
