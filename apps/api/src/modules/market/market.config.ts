import type { ExchangeId } from "@aegis/contracts";

/**
 * Per-exchange configuration.
 *
 * Everything here is a *capability declaration*, not a preference. `hasWebSocket:
 * false` does not mean "we chose not to stream" — it means this adapter cannot,
 * and the platform must poll instead. Downstream code reads these flags rather
 * than assuming, because an assumption about a missing feed is how you end up
 * with a strategy silently evaluating stale data.
 *
 * `hasDerivatives: false` is the one that matters most. Crowd Squeeze ships
 * DISABLED precisely because funding and open interest were unavailable
 * (06-STRATEGIES §3). When an exchange declares them here, that becomes true for
 * that exchange — and *only* for that exchange.
 */
export interface ExchangeConfig {
  id: ExchangeId;
  /** The `ccxt` module name. Never leaks outside this module. */
  ccxtId: string;
  enabled: boolean;

  /** Live streams, or REST polling. */
  hasWebSocket: boolean;
  /** Funding rate + open interest. Absent means the strategy stands down. */
  hasDerivatives: boolean;
  /** Forced-liquidation feed. Rare, and only Binance streams it usefully. */
  hasLiquidations: boolean;

  /** Native WebSocket endpoint. Only meaningful when hasWebSocket. */
  wsUrl?: string;

  /** Requests per minute we will allow ourselves. Below the published cap. */
  rateLimitPerMinute: number;
  /** REST timeout. */
  timeoutMs: number;
  /** How long a WS may go silent before we assume it is dead. */
  heartbeatMs: number;
  /** Consecutive failures before the circuit opens. */
  circuitBreakerThreshold: number;
}

/**
 * Rate limits are set BELOW each exchange's published ceiling, deliberately.
 *
 * Hitting the ceiling gets the whole platform IP-banned for minutes — and a ban
 * does not degrade one strategy, it blinds every one of them at once. The
 * headroom is cheap; the ban is not.
 */
export const EXCHANGES: Record<ExchangeId, ExchangeConfig> = {
  BINANCE: {
    id: "BINANCE",
    ccxtId: "binance",
    enabled: true,
    hasWebSocket: true,
    hasDerivatives: true,
    hasLiquidations: true,
    wsUrl: "wss://fstream.binance.com/stream",
    // Binance publishes 1200 weight/min. We take a fraction and stay invisible.
    rateLimitPerMinute: 900,
    timeoutMs: 15_000,
    heartbeatMs: 30_000,
    circuitBreakerThreshold: 5,
  },

  BYBIT: {
    id: "BYBIT",
    ccxtId: "bybit",
    enabled: true,
    hasWebSocket: false,
    hasDerivatives: true,
    hasLiquidations: false,
    rateLimitPerMinute: 500,
    timeoutMs: 15_000,
    heartbeatMs: 30_000,
    circuitBreakerThreshold: 5,
  },

  /*
   * OKX is DISABLED, and not because of anything OKX did.
   *
   * It is unreachable from the development network even once DNS is bypassed —
   * the block is at the network layer, not the resolver. Leaving it enabled costs
   * a failed connect and a 15-second timeout on every boot, and buys nothing: the
   * circuit breaker opens, the platform carries on, and the logs fill with an
   * outage that is ours rather than theirs.
   *
   * Binance (REST + WebSocket) and Bybit (REST) are reachable and are enough to
   * drive the entire pipeline. Re-enable this from the VPS, where it is very
   * likely reachable — but VERIFY it there before trusting it.
   */
  OKX: {
    id: "OKX",
    ccxtId: "okx",
    enabled: false,
    hasWebSocket: false,
    hasDerivatives: true,
    hasLiquidations: false,
    rateLimitPerMinute: 400,
    timeoutMs: 15_000,
    heartbeatMs: 30_000,
    circuitBreakerThreshold: 5,
  },

  BITGET: {
    id: "BITGET",
    ccxtId: "bitget",
    enabled: false,
    hasWebSocket: false,
    hasDerivatives: true,
    hasLiquidations: false,
    rateLimitPerMinute: 300,
    timeoutMs: 15_000,
    heartbeatMs: 30_000,
    circuitBreakerThreshold: 5,
  },

  KUCOIN: {
    id: "KUCOIN",
    ccxtId: "kucoin",
    enabled: false,
    hasWebSocket: false,
    hasDerivatives: false,
    hasLiquidations: false,
    rateLimitPerMinute: 300,
    timeoutMs: 15_000,
    heartbeatMs: 30_000,
    circuitBreakerThreshold: 5,
  },
};

/**
 * The universe. Liquid majors that genuinely list everywhere.
 *
 * Not cosmetic: an invented listing produces a signal on a market we cannot
 * actually read. The frontend already learned this the hard way — the mock was
 * pairing coins with exchanges at random and rendering charts for symbols that
 * do not exist.
 */
export const DEFAULT_UNIVERSE = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOGE",
  "LINK", "ARB", "OP", "DOT", "ATOM", "NEAR", "APT", "SUI",
  "TON", "LTC", "INJ",
] as const;

export function enabledExchanges(): ExchangeConfig[] {
  return Object.values(EXCHANGES).filter((e) => e.enabled);
}
