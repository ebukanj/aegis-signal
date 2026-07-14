import { Injectable, Logger } from "@nestjs/common";
import {
  candleSchema,
  fundingRateSchema,
  openInterestSchema,
  orderBookSummarySchema,
  tickerSchema,
  type Candle,
  type ExchangeId,
  type FundingRate,
  type OpenInterest,
  type OrderBookSummary,
  type Ticker,
} from "@aegis/contracts";

/**
 * The boundary.
 *
 * Everything an exchange sends passes through here, and **nothing leaves without
 * being validated against the contract**. Not "should be validated" — cannot
 * leave, because these functions return `null` for anything that fails and the
 * callers drop it.
 *
 * This is the single most important file in the market module, and the reason is
 * arithmetic. A candle with a high below its low is not a rendering glitch; it is
 * an ATR that is wrong, a Bollinger band that is wrong, a stop distance that is
 * wrong, and a position size that is wrong — computed silently, with no error
 * anywhere, and handed to a trader as a number to bet on.
 *
 * Exchanges send bad data. Not often, but they do: under load, mid-outage, on a
 * fresh listing with no history, on a delisted market that still answers. The
 * correct response is to **drop the row and log it**, never to repair it. A
 * repaired candle is a candle we invented.
 */
@Injectable()
export class MarketNormalizer {
  private readonly logger = new Logger(MarketNormalizer.name);

  /** Rows rejected, per exchange. The Admin console reads this. */
  private readonly rejected = new Map<string, number>();

  /* ── Candles ─────────────────────────────────────────────────────── */

  /**
   * CCXT's OHLCV row: `[timestamp, open, high, low, close, volume]`.
   *
   * Returns null on anything the contract refuses. A dropped candle leaves a gap,
   * and a gap is visible; a *silently corrected* candle is not, and it poisons
   * every indicator downstream while looking perfectly healthy.
   */
  candle(exchange: ExchangeId, row: unknown): Candle | null {
    if (!Array.isArray(row) || row.length < 6) {
      return this.reject(exchange, "candle", "malformed OHLCV row");
    }

    const [time, open, high, low, close, volume] = row as unknown[];

    const parsed = candleSchema.safeParse({
      time: Number(time),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    });

    if (!parsed.success) {
      return this.reject(
        exchange,
        "candle",
        parsed.error.issues.map((i) => i.message).join("; "),
        { row },
      );
    }

    return parsed.data;
  }

  candles(exchange: ExchangeId, rows: unknown[]): Candle[] {
    const out: Candle[] = [];

    for (const row of rows) {
      const candle = this.candle(exchange, row);
      if (candle) out.push(candle);
    }

    // Exchanges are *usually* ordered. "Usually" is not a guarantee, and an
    // out-of-order series makes every moving average nonsense in a way that is
    // impossible to spot by eye.
    out.sort((a, b) => a.time - b.time);

    return out;
  }

  /* ── Ticker ──────────────────────────────────────────────────────── */

  ticker(
    exchange: ExchangeId,
    pair: string,
    raw: Record<string, unknown>,
  ): Ticker | null {
    // CCXT normalises most of this, but `quoteVolume` is genuinely absent on
    // some venues. We compute it rather than defaulting it to 0 — a 0 would read
    // to the liquidity gate as "no volume", and every signal on the pair would
    // be rejected for a reason that is not true.
    const last = Number(raw.last ?? raw.close);
    const quoteVolume =
      raw.quoteVolume != null
        ? Number(raw.quoteVolume)
        : Number(raw.baseVolume ?? 0) * (Number.isFinite(last) ? last : 0);

    const parsed = tickerSchema.safeParse({
      exchange,
      pair,
      last,
      bid: Number(raw.bid ?? last),
      ask: Number(raw.ask ?? last),
      quoteVolume24h: quoteVolume,
      changePercent24h: Number(raw.percentage ?? 0),
      at: new Date(Number(raw.timestamp ?? Date.now())).toISOString(),
    });

    if (!parsed.success) {
      return this.reject(
        exchange,
        "ticker",
        parsed.error.issues.map((i) => i.message).join("; "),
        { pair },
      );
    }

    return parsed.data;
  }

  /* ── Order book ──────────────────────────────────────────────────── */

  orderBook(
    exchange: ExchangeId,
    pair: string,
    raw: { bids?: unknown[][]; asks?: unknown[][]; timestamp?: number },
  ): OrderBookSummary | null {
    const bids = raw.bids ?? [];
    const asks = raw.asks ?? [];

    if (bids.length === 0 || asks.length === 0) {
      return this.reject(exchange, "book", "empty book", { pair });
    }

    const bestBid = Number(bids[0][0]);
    const bestAsk = Number(asks[0][0]);
    const mid = (bestBid + bestAsk) / 2;

    // Depth within 1% of mid. This is what the Risk Engine's slippage estimate
    // reads — a book that is tight at the top and hollow beneath it will fill
    // the first lot at the quoted price and the rest anywhere.
    const within = (levels: unknown[][], floor: number, ceil: number) =>
      levels.reduce((sum, [price, size]) => {
        const p = Number(price);
        return p >= floor && p <= ceil ? sum + p * Number(size) : sum;
      }, 0);

    const parsed = orderBookSummarySchema.safeParse({
      exchange,
      pair,
      bestBid,
      bestAsk,
      spreadPercent: mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0,
      bidDepth1Percent: within(bids, mid * 0.99, mid),
      askDepth1Percent: within(asks, mid, mid * 1.01),
      at: new Date(raw.timestamp ?? Date.now()).toISOString(),
    });

    if (!parsed.success) {
      return this.reject(
        exchange,
        "book",
        parsed.error.issues.map((i) => i.message).join("; "),
        { pair },
      );
    }

    return parsed.data;
  }

  /* ── Derivatives ─────────────────────────────────────────────────── */

  fundingRate(
    exchange: ExchangeId,
    pair: string,
    raw: Record<string, unknown>,
  ): FundingRate | null {
    const rate = Number(raw.fundingRate);

    // A missing funding rate must stay MISSING. Defaulting it to 0 would tell
    // Crowd Squeeze "the market is perfectly balanced" — a specific, tradeable
    // claim about a thing we did not measure.
    if (!Number.isFinite(rate)) {
      return this.reject(exchange, "funding", "no funding rate", { pair });
    }

    const parsed = fundingRateSchema.safeParse({
      exchange,
      pair,
      // CCXT returns a decimal (0.0001). Traders and our contracts speak percent.
      rate: rate * 100,
      intervalHours: Number(raw.interval ?? 8),
      nextFundingAt: new Date(
        Number(raw.fundingTimestamp ?? Date.now() + 8 * 3_600_000),
      ).toISOString(),
      at: new Date(Number(raw.timestamp ?? Date.now())).toISOString(),
    });

    if (!parsed.success) {
      return this.reject(
        exchange,
        "funding",
        parsed.error.issues.map((i) => i.message).join("; "),
        { pair },
      );
    }

    return parsed.data;
  }

  openInterest(
    exchange: ExchangeId,
    pair: string,
    raw: Record<string, unknown>,
  ): OpenInterest | null {
    const parsed = openInterestSchema.safeParse({
      exchange,
      pair,
      amount: Number(raw.openInterestAmount ?? raw.openInterest ?? 0),
      notionalUsd: Number(raw.openInterestValue ?? 0),
      at: new Date(Number(raw.timestamp ?? Date.now())).toISOString(),
    });

    if (!parsed.success) {
      return this.reject(
        exchange,
        "openInterest",
        parsed.error.issues.map((i) => i.message).join("; "),
        { pair },
      );
    }

    return parsed.data;
  }

  /* ── Observability ───────────────────────────────────────────────── */

  private reject(
    exchange: ExchangeId,
    kind: string,
    reason: string,
    context?: Record<string, unknown>,
  ): null {
    const key = `${exchange}:${kind}`;
    this.rejected.set(key, (this.rejected.get(key) ?? 0) + 1);

    this.logger.warn(
      { exchange, kind, reason, ...context },
      "Rejected malformed market data at the boundary",
    );

    return null;
  }

  /** Rejections by exchange and type. A rising count means a feed is degrading. */
  rejectionCounts(): Record<string, number> {
    return Object.fromEntries(this.rejected);
  }
}
