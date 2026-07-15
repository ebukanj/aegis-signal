import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { EVENT, type SignalPublished } from "@aegis/contracts";
import { LedgerService } from "../services/ledger.service";
import { SignalRepository } from "../../../signals/infrastructure/repository/signal.repository";

/**
 * The bridge from publication to permanent memory.
 *
 * The moment the Signal Engine publishes, the ledger must record it — before it can
 * trigger, before it can settle, while it is still nothing but a promise. That is
 * the point of a ledger: it remembers the trade the platform committed to, so that
 * later, when the trade has resolved, "what did we say?" and "what happened?" can be
 * compared. A ledger that only recorded settled trades could not tell you about the
 * ones that never triggered — and those are evidence too.
 *
 * It listens rather than being called, so the Signal Engine never needs to know the
 * ledger exists (AGENTS.md §5, event-driven). Registration is idempotent, so a
 * replayed event records nothing twice.
 */
@Injectable()
export class LedgerTracker {
  private readonly logger = new Logger(LedgerTracker.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly signals: SignalRepository,
  ) {}

  @OnEvent(EVENT.SIGNAL_PUBLISHED)
  async onPublished(event: SignalPublished): Promise<void> {
    const signal = await this.signals.byId(event.signalId);
    if (!signal) {
      this.logger.warn(`Published event for ${event.signalId} but the signal is not in the repository`);
      return;
    }
    await this.ledger.register(signal);
  }
}
