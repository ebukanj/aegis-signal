import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ExchangeId } from "@aegis/contracts";
import { MarketService } from "./market.service";

/**
 * Is the exchange still there?
 *
 * Nothing else asks. The circuit breaker only learns an exchange is down when a
 * request fails — which means the first request after an outage begins is the one
 * that pays for the discovery, and until somebody happens to ask, the platform
 * believes an exchange it cannot reach is perfectly healthy.
 *
 * So: ping, on a schedule, whether or not anyone is looking. It is the difference
 * between "we have not heard from Bybit in twenty minutes" and "Bybit is down" —
 * and only one of those can be shown to a trader or acted on by an operator.
 *
 * The ping also measures LATENCY, which is the early warning. An exchange rarely
 * fails cleanly; it gets slow first. A REST call that took 80ms last week and
 * takes 4 seconds today is an exchange about to stop answering, and the admin
 * console should be able to see that coming.
 */
@Injectable()
export class ExchangeHealthWorker {
  private readonly logger = new Logger(ExchangeHealthWorker.name);

  /** What we believed last time, so we only announce CHANGES. */
  private readonly wasHealthy = new Map<ExchangeId, boolean>();

  constructor(
    private readonly market: MarketService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Every thirty seconds.
   *
   * Frequent enough that an outage is noticed inside the life of a single 15m
   * candle; cheap enough that it is a rounding error against the rate budget
   * (two calls a minute, per exchange, against a ceiling of hundreds).
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async check(): Promise<void> {
    await Promise.allSettled(
      this.market.exchanges().map((id) => this.ping(id)),
    );
  }

  private async ping(exchange: ExchangeId): Promise<void> {
    const previously = this.wasHealthy.get(exchange) ?? true;

    try {
      const latencyMs = await this.market.ping(exchange);

      if (!previously) {
        this.logger.log({ exchange, latencyMs }, "Exchange has RECOVERED");
        this.events.emit("exchange.recovered", { exchange });
      }

      /*
       * Slow is not down, and it is not nothing.
       *
       * An exchange answering in seconds rather than milliseconds is degrading.
       * Signals built on its data are being computed from candles that arrived
       * late, and the next stage of this failure is usually silence.
       */
      if (latencyMs > SLOW_MS) {
        this.logger.warn(
          { exchange, latencyMs },
          "Exchange is answering slowly — it may be about to stop answering",
        );
      }

      this.wasHealthy.set(exchange, true);
    } catch (error) {
      // Only announce the TRANSITION. An exchange that has been down for an hour
      // must not emit a hundred and twenty identical alarms — an alert channel
      // that cries wolf is an alert channel nobody reads.
      if (previously) {
        this.logger.error({ exchange, err: error }, "Exchange is DOWN");
        this.events.emit("exchange.disconnected", {
          exchange,
          reason: error instanceof Error ? error.message : "unreachable",
        });
      }

      this.wasHealthy.set(exchange, false);
    }
  }
}

/** Above this, an exchange is degrading rather than merely busy. */
const SLOW_MS = 2_000;
