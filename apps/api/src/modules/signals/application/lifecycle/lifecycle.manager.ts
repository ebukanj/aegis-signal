import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomUUID } from "node:crypto";
import { EVENT, type SignalStatus } from "@aegis/contracts";

/**
 * The legal moves. A published signal's life is a state machine, and a machine
 * with no rules is a machine that can go backwards — a COMPLETED trade re-opening
 * as ACTIVE, a STOPPED one reporting a win. The ledger's integrity (M11) depends
 * on these transitions being the only ones that can happen.
 *
 *   ACTIVE      — published, waiting for price to reach the entry.
 *   TRIGGERED   — price reached the entry; the trade is on.
 *   COMPLETED   — a take-profit was hit. A win.
 *   STOPPED     — the stop was hit. A loss.
 *   EXPIRED     — neither happened before the setup aged out. A non-event.
 *
 * COMPLETED, STOPPED and EXPIRED are TERMINAL. Nothing leaves them. A settled
 * outcome is a matter of record, and a record that can change is not one.
 */
const TRANSITIONS: Record<SignalStatus, readonly SignalStatus[]> = {
  ACTIVE: ["TRIGGERED", "EXPIRED", "STOPPED"],
  /*
   * A TRIGGERED trade can still expire — it was entered, then went nowhere and ran
   * out its clock without reaching either exit. That is a real, common outcome and
   * the ledger must be able to represent it.
   */
  TRIGGERED: ["COMPLETED", "STOPPED", "EXPIRED"],
  COMPLETED: [],
  STOPPED: [],
  EXPIRED: [],
};

export interface Transition {
  readonly from: SignalStatus;
  readonly to: SignalStatus;
  readonly reason: string;
  readonly at: number;
}

@Injectable()
export class LifecycleManager {
  private readonly logger = new Logger(LifecycleManager.name);

  constructor(private readonly events: EventEmitter2) {}

  /** Is this move legal? A guard the repository consults before it writes. */
  canTransition(from: SignalStatus, to: SignalStatus): boolean {
    return TRANSITIONS[from].includes(to);
  }

  isTerminal(status: SignalStatus): boolean {
    return TRANSITIONS[status].length === 0;
  }

  /**
   * Validate and announce a transition. Throws on an illegal move rather than
   * silently ignoring it — a caller trying to move a COMPLETED signal to ACTIVE has
   * a bug, and a bug about the track record is not one to swallow.
   */
  transition(
    signalId: string,
    from: SignalStatus,
    to: SignalStatus,
    reason: string,
    at: number,
  ): Transition {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Illegal lifecycle move for ${signalId}: ${from} → ${to}. ` +
          `${from} may only become ${TRANSITIONS[from].join(", ") || "(nothing — it is terminal)"}.`,
      );
    }

    this.events.emit(EVENT.SIGNAL_LIFECYCLE_CHANGED, {
      name: EVENT.SIGNAL_LIFECYCLE_CHANGED,
      eventId: randomUUID(),
      correlationId: randomUUID(),
      occurredAt: new Date(at).toISOString(),
      signalId,
      from,
      to,
    });

    this.logger.log(`${signalId}: ${from} → ${to} (${reason})`);

    return { from, to, reason, at };
  }
}
