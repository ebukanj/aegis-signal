import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type { HealthIndicatorResult } from "@nestjs/terminus";
import { MarketService } from "./application/market.service";

/**
 * Exchange connectivity, on `/health`.
 *
 * **Deliberately NOT fatal.** One exchange going down must not fail the container
 * — that would let Binance having a bad afternoon take the whole platform out of
 * rotation, and an orchestrator restarting a perfectly healthy container fixes
 * nothing while making the outage worse.
 *
 * What it must do is TELL THE TRUTH. So the check reports `down` only when EVERY
 * exchange is unreachable — at which point the platform genuinely cannot see the
 * market, and a container that cannot see the market has nothing to offer.
 *
 * The per-exchange detail rides along either way, so an operator reading a green
 * health check can still see that Bybit has been gone for an hour.
 */
@Injectable()
export class ExchangeHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly market: MarketService,
  ) {}

  check(key = "exchanges"): HealthIndicatorResult {
    const indicator = this.health.check(key);
    const exchanges = this.market.health();

    const connected = exchanges.filter((e) => e.connected);

    const detail = {
      connected: connected.length,
      total: exchanges.length,
      exchanges: Object.fromEntries(
        exchanges.map((e) => [
          e.exchange,
          {
            connected: e.connected,
            latencyMs: e.latencyMs,
            circuitOpen: e.circuitOpen,
            reconnects: e.reconnectCount,
          },
        ]),
      ),
    };

    /*
     * Every exchange is gone. Not a degraded platform — a blind one.
     *
     * Note this is also `down` when no adapters exist at all, which is correct:
     * a market module holding zero exchanges is not "fine, just idle", it is a
     * platform that will never produce a signal and should not be pretending
     * otherwise.
     */
    if (connected.length === 0) {
      return indicator.down(detail);
    }

    return indicator.up(detail);
  }
}
