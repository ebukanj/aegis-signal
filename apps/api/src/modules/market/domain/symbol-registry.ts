import { Injectable, Logger } from "@nestjs/common";
import type { ExchangeId, MarketType } from "@aegis/contracts";

/**
 * The Symbol Registry — one coin, one name, everywhere.
 *
 * Every exchange spells the same market differently:
 *
 *     Binance spot   BTCUSDT
 *     Binance perp   BTCUSDT          (same string, different market!)
 *     Bybit          BTC/USDT:USDT
 *     OKX spot       BTC-USDT
 *     OKX perp       BTC-USDT-SWAP
 *     KuCoin         BTC-USDT
 *     TradingView    BINANCE:BTCUSDT.P
 *
 * If those strings travel upward, every module downstream has to know all of
 * them — and the first time one of them is compared to another with `===`, a
 * signal fires on the wrong market. Worse: Binance uses the *identical* string
 * for spot and perpetual, so a naive registry silently conflates two markets
 * with different prices, different leverage, and different liquidation
 * behaviour.
 *
 * So: everything above this class speaks a **canonical symbol** — `"BTC"` — plus
 * a `MarketType`. That pair is unambiguous. The exchange-specific spelling exists
 * only at the moment a request leaves, and dies the moment a response arrives.
 */

export interface MarketRef {
  /** "BTC". Uppercase base asset. */
  symbol: string;
  marketType: MarketType;
}

@Injectable()
export class SymbolRegistry {
  private readonly logger = new Logger(SymbolRegistry.name);

  /** canonical "BTC:PERPETUAL" → exchange-native string, per exchange. */
  private readonly native = new Map<string, Map<ExchangeId, string>>();

  /** Every market an exchange actually lists. Absent = do not trade it there. */
  private readonly listed = new Map<ExchangeId, Set<string>>();

  /* ── Canonicalising ──────────────────────────────────────────────── */

  /**
   * Turn any exchange's spelling into a canonical symbol.
   *
   * Deliberately strict. An unrecognised string returns `null` rather than a
   * best guess — a *wrong* canonical symbol is worse than none at all, because it
   * routes real data into the wrong market's candle series, and nothing anywhere
   * will complain.
   */
  canonicalise(raw: string): string | null {
    if (!raw) return null;

    const cleaned = raw
      .toUpperCase()
      .trim()
      // TradingView's perpetual suffix, and OKX's.
      .replace(/\.P$/, "")
      .replace(/-SWAP$/, "")
      // Bybit's settlement suffix: "BTC/USDT:USDT" → "BTC/USDT"
      .replace(/:[A-Z]+$/, "")
      // Every separator anyone uses.
      .replace(/[-/_]/g, "");

    // Strip the quote asset. Order matters: USDT before USD, or "BTCUSDT"
    // becomes "BTCT".
    for (const quote of ["USDT", "USDC", "BUSD", "USD"]) {
      if (cleaned.endsWith(quote)) {
        const base = cleaned.slice(0, -quote.length);
        return base.length >= 2 ? base : null;
      }
    }

    return null;
  }

  /** The key everything is stored under. Spot and perp are different markets. */
  private key(ref: MarketRef): string {
    return `${ref.symbol}:${ref.marketType}`;
  }

  /* ── Registration ────────────────────────────────────────────────── */

  /**
   * Record that an exchange lists a market, and how it spells it.
   *
   * Called once per exchange at startup from `fetchSymbols()`. Nothing is
   * assumed: if Binance does not list TON perpetuals, the registry does not
   * pretend it does — and the scanner will not produce a signal on a market that
   * does not exist. (The frontend mock made exactly that mistake and rendered
   * charts for symbols nobody trades.)
   */
  register(input: {
    exchange: ExchangeId;
    canonical: string;
    marketType: MarketType;
    nativeSymbol: string;
  }): void {
    const key = this.key({
      symbol: input.canonical,
      marketType: input.marketType,
    });

    if (!this.native.has(key)) this.native.set(key, new Map());
    this.native.get(key)!.set(input.exchange, input.nativeSymbol);

    if (!this.listed.has(input.exchange)) {
      this.listed.set(input.exchange, new Set());
    }
    this.listed.get(input.exchange)!.add(key);
  }

  /* ── Resolution ──────────────────────────────────────────────────── */

  /**
   * Canonical → the string this exchange wants.
   *
   * Null means **this exchange does not list this market**. The caller must not
   * fall back to a guess: a request for a market an exchange has never heard of
   * returns an error, and an error we invent data for is a lie.
   */
  toNative(exchange: ExchangeId, ref: MarketRef): string | null {
    return this.native.get(this.key(ref))?.get(exchange) ?? null;
  }

  /** Does this exchange actually list this market? */
  lists(exchange: ExchangeId, ref: MarketRef): boolean {
    return this.listed.get(exchange)?.has(this.key(ref)) ?? false;
  }

  /** Every exchange that lists this market. */
  exchangesFor(ref: MarketRef): ExchangeId[] {
    const key = this.key(ref);
    return [...(this.native.get(key)?.keys() ?? [])];
  }

  /** Everything one exchange lists, canonically. */
  marketsOn(exchange: ExchangeId): MarketRef[] {
    return [...(this.listed.get(exchange) ?? [])].map((key) => {
      const [symbol, marketType] = key.split(":");
      return { symbol, marketType: marketType as MarketType };
    });
  }

  size(): number {
    return this.native.size;
  }

  clear(): void {
    this.native.clear();
    this.listed.clear();
  }

  logSummary(): void {
    for (const [exchange, keys] of this.listed) {
      this.logger.log(
        { exchange, markets: keys.size },
        "Symbol registry populated",
      );
    }
  }
}
