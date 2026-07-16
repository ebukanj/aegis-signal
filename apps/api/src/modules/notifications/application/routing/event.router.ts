import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { EVENT, type SignalPublished } from "@aegis/contracts";

import {
  NotificationOrchestrator,
  type DispatchRequest,
} from "../orchestrator/notification.orchestrator";
import { TemplateRenderer } from "../templates/template.renderer";
import { NotificationPreferencesProvider } from "../preferences/notification-preferences.provider";
import { SignalRepository } from "../../../signals/infrastructure/repository/signal.repository";

/**
 * The bridge from platform events to notifications.
 *
 * ── It routes. It contains no business logic. ──
 *
 * Its entire job is: hear an event, decide the notification TYPE and AUDIENCE,
 * render the message, and hand it to the orchestrator. It never re-evaluates the
 * event — a `SIGNAL_PUBLISHED` is worth telling a trader about because it was
 * published, and whether it SHOULD have been was decided long before it got here.
 *
 * It listens rather than being called, so the engines that emit these events never
 * learn the notification engine exists (AGENTS.md §5). Adding a new notifiable
 * event is a new `@OnEvent` handler here and a new template — no existing code
 * changes, which is the "registerable without modifying existing code" requirement.
 */
@Injectable()
export class EventRouter {
  private readonly logger = new Logger(EventRouter.name);

  constructor(
    private readonly orchestrator: NotificationOrchestrator,
    private readonly templates: TemplateRenderer,
    private readonly signals: SignalRepository,
    private readonly recipients: NotificationPreferencesProvider,
  ) {}

  /* ── Signals ───────────────────────────────────────────────────── */

  @OnEvent(EVENT.SIGNAL_PUBLISHED)
  async onSignalPublished(event: SignalPublished): Promise<void> {
    const signal = await this.signals.byId(event.signalId);
    if (!signal) return;

    /* Prime is the loud one — the few the platform interrupts a trader for
     * (ADR-021). A non-Prime published signal is a MEDIUM heads-up. */
    const type = signal.isPrime ? "PRIME_SIGNAL" : "SIGNAL_PUBLISHED";
    const message = signal.isPrime
      ? this.templates.primeSignal(signal)
      : this.templates.signalPublished(signal);

    await this.dispatch({
      type,
      message,
      dedupeKey: signal.id,
      subject: signal.symbol,
      strategyId: signal.strategies[0],
      confidence: signal.confidence.score,
    });

    /*
     * Telegram fan-out. The dispatch above carries the in-app feed (a broadcast);
     * this reaches each user who linked Telegram AND either watches this coin or is
     * looking at a Prime signal. `onlyChannels: TELEGRAM` keeps it from firing
     * in-app a second time. Per-user, so quiet hours and the enabled-channel gate
     * are each person's own.
     */
    for (const target of this.recipients.telegramTargetsFor(signal.symbol, signal.isPrime)) {
      await this.dispatch({
        type,
        message,
        dedupeKey: signal.id,
        subject: signal.symbol,
        strategyId: signal.strategies[0],
        confidence: signal.confidence.score,
        recipient: target.userId,
        onlyChannels: ["TELEGRAM"],
      });
    }
  }

  @OnEvent("signals.changed")
  onSignalsChanged(): void {
    /* The feed re-ranked. Not a per-signal event — the settlement events below
     * carry the trader-facing news, so there is nothing to notify here. */
  }

  /* ── Settlement outcomes (from the ledger) ─────────────────────── */

  @OnEvent("ledger.settled")
  async onSettled(event: { signalId: string; strategyId: string; outcome: string; realisedR: number }): Promise<void> {
    const signal = await this.signals.byId(event.signalId);
    const symbol = signal?.symbol ?? event.signalId;

    if (event.outcome === "WINNER" || event.outcome === "PARTIAL_WINNER") {
      await this.dispatch({
        type: "TAKE_PROFIT",
        message: this.templates.takeProfit(symbol, event.signalId, event.realisedR),
        dedupeKey: `tp:${event.signalId}`,
        subject: symbol,
        strategyId: event.strategyId,
      });
    } else if (event.outcome === "LOSER" || event.outcome === "PARTIAL_LOSER") {
      await this.dispatch({
        type: "STOP_LOSS",
        message: this.templates.stopLoss(symbol, event.signalId),
        dedupeKey: `sl:${event.signalId}`,
        subject: symbol,
        strategyId: event.strategyId,
      });
    } else if (event.outcome === "EXPIRED") {
      await this.dispatch({
        type: "SIGNAL_EXPIRED",
        message: this.templates.signalExpired(symbol, event.signalId),
        dedupeKey: `exp:${event.signalId}`,
        subject: symbol,
        strategyId: event.strategyId,
      });
    }
  }

  /* ── Risk & platform ───────────────────────────────────────────── */

  @OnEvent("insight.risk-flag-raised")
  async onRiskFlag(event: { coin: string; kind: string; headline?: string }): Promise<void> {
    await this.dispatch({
      type: "RISK_ALERT",
      message: this.templates.riskAlert(event.coin, event.kind, event.headline ?? `${event.kind} on ${event.coin}`),
      dedupeKey: `flag:${event.coin}:${event.kind}`,
      subject: event.coin,
    });
  }

  @OnEvent(EVENT.STRATEGY_AUTO_DISABLED)
  async onStrategyDisabled(event: { strategyId: string; rollingExpectancy: number }): Promise<void> {
    await this.dispatch({
      type: "STRATEGY_DISABLED",
      message: this.templates.strategyDisabled(event.strategyId, event.rollingExpectancy),
      dedupeKey: `disabled:${event.strategyId}:${Date.now()}`,
      subject: null,
      strategyId: event.strategyId,
    });
  }

  @OnEvent("macro.event.imminent")
  async onMacroImminent(event: { title: string; minutesUntil: number; impact: string }): Promise<void> {
    await this.dispatch({
      type: "SYSTEM_ANNOUNCEMENT",
      message: this.templates.macroImminent(event.title, event.minutesUntil),
      /* One warning per event per hour — bucket so a minute-by-minute check cannot
       * spam even if it somehow fired twice. */
      dedupeKey: `macro:${event.title}:${Math.floor(Date.now() / 3_600_000)}`,
      subject: null,
    });
  }

  @OnEvent("exchange.disconnected")
  async onExchangeDown(event: { exchange: string }): Promise<void> {
    await this.dispatch({
      type: "EXCHANGE_OFFLINE",
      message: this.templates.exchangeOffline(event.exchange),
      /* Bucket by the hour so a flapping connection does not spam — one alert an
       * hour per exchange is plenty. */
      dedupeKey: `offline:${event.exchange}:${Math.floor(Date.now() / 3_600_000)}`,
      subject: null,
    });
  }

  private async dispatch(request: Omit<DispatchRequest, "priority">): Promise<void> {
    try {
      await this.orchestrator.dispatch({
        ...request,
        priority: this.templates.priorityFor(request.type),
      });
    } catch (error) {
      /* A notification failure must never propagate back into the engine that
       * emitted the event — the trade is published regardless of whether the alert
       * went out. */
      this.logger.error({ err: error }, `Failed to route ${request.type}`);
    }
  }
}
