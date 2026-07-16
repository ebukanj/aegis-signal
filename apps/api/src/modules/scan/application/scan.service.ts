import { Injectable, Logger } from "@nestjs/common";
import type { Candle, ExchangeId, ScanRequest, ScanResult, Timeframe } from "@aegis/contracts";

import { AppConfigService } from "../../../config/app-config.service";
import { MarketService } from "../../market/application/market.service";
import { SymbolRegistry } from "../../market/domain/symbol-registry";
import { DEFAULT_UNIVERSE, enabledExchanges } from "../../market/market.config";
import { SignalService } from "../../signals/application/services/signal.service";
import { SignalReadService } from "../../signals/application/read/signal-read.service";
import type { SignalCandidate } from "../../signals/domain/intake";
import { ScanOrchestrator } from "./scan.orchestrator";

/** One symbol, on one exchange, to scan this cycle. */
interface UniversePair {
  symbol: string;
  exchange: ExchangeId;
}

/** What the last sweep measured — the diagnostics a scan result carries. */
interface SweepDiagnostics {
  pairsChecked: number;
  exchanges: number;
  passed: number;
  durationMs: number;
  scannedAt: string;
}

/**
 * The live scan — the top of the pipeline that was missing.
 *
 * It enumerates a bounded, liquidity-ordered universe across every ENABLED
 * exchange (Binance + Bybit today; OKX stays disabled, so it never appears),
 * fetches each symbol's closed candles, runs the {@link ScanOrchestrator}, and
 * hands the risk-approved, confidence-scored candidates to the Signal Engine to
 * publish. The Signal Engine — not this service — dedupes, ranks, freshness-checks
 * and awards Prime. This service only *finds*; it never decides what publishes.
 *
 * The universe is bounded on purpose. Scanning every listed pair every minute is
 * how a platform gets its IP banned, and a ban blinds every strategy at once
 * (market.config). So it scans the majors plus as many additional listed pairs as
 * `SCAN_MAX_SYMBOLS` allows — opportunity is not restricted to a fixed shortlist,
 * but the work is capped so the feed never goes dark for a rate limit.
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private last: SweepDiagnostics | null = null;

  constructor(
    private readonly orchestrator: ScanOrchestrator,
    private readonly market: MarketService,
    private readonly registry: SymbolRegistry,
    private readonly signals: SignalService,
    private readonly read: SignalReadService,
    private readonly config: AppConfigService,
  ) {}

  /* ── The background sweep (the worker calls this) ─────────────────── */

  /**
   * One full pass over the universe: find candidates, publish them, record the
   * diagnostics. Returns how many pairs were checked and how many setups passed.
   */
  async sweep(request?: ScanRequest): Promise<SweepDiagnostics> {
    const started = Date.now();
    const now = Date.now();

    const timeframes = this.scanTimeframes(request);
    const pairs = this.universe(request);

    // BTC is the correlation reference every symbol is measured against. Fetch it
    // once per sweep, from Binance, and reuse it — never per symbol.
    const btcByTimeframe = await this.fetchCandles("BTC", "BINANCE", timeframes);

    const all: SignalCandidate[] = [];
    let checked = 0;

    for (const { symbol, exchange } of pairs) {
      const candlesByTimeframe = await this.fetchCandles(symbol, exchange, timeframes);
      if (Object.keys(candlesByTimeframe).length === 0) continue;
      checked += 1;

      try {
        const candidates = await this.orchestrator.scanSymbol({
          symbol,
          exchange,
          candlesByTimeframe,
          btcByTimeframe,
          now,
        });
        all.push(...candidates);
      } catch (error) {
        this.logger.debug({ symbol, exchange, err: error }, "Symbol scan failed — skipped");
      }
    }

    // The Signal Engine owns publication: dedup, ranking, freshness, Prime budget.
    if (all.length > 0) {
      try {
        await this.signals.publish(all);
      } catch (error) {
        this.logger.error({ err: error }, "Publishing scanned candidates failed");
      }
    }

    const diagnostics: SweepDiagnostics = {
      pairsChecked: checked,
      exchanges: enabledExchanges().length,
      passed: all.length,
      durationMs: Date.now() - started,
      scannedAt: new Date().toISOString(),
    };

    this.last = diagnostics;

    this.logger.log(
      `Scan: ${checked} pairs checked · ${all.length} passed · ${diagnostics.durationMs}ms`,
    );

    return diagnostics;
  }

  /* ── On-demand scan (the Scanner page calls this) ────────────────── */

  /**
   * Run a scan the user asked for and return the ranked, published result plus its
   * diagnostics. It IS the same sweep — a scan the user triggers is not a different
   * pipeline from the one the platform runs itself.
   */
  async scan(request: ScanRequest): Promise<ScanResult> {
    const diagnostics = await this.sweep(request);
    return this.resultFrom(diagnostics);
  }

  /** The most recent scan, for the Scanner page's initial paint. */
  async latest(): Promise<ScanResult> {
    if (!this.last) {
      // Nothing has swept yet — do one now rather than show an empty shell.
      return this.scan({ market: "ALL", timeframe: "ALL", exchange: "ALL" });
    }
    return this.resultFrom(this.last);
  }

  private async resultFrom(diagnostics: SweepDiagnostics): Promise<ScanResult> {
    const feed = await this.read.feed(Date.now());
    const opportunities = [...feed.prime, ...feed.validated];

    // Enrich rows with the live last price, so a trader sees how far price sits
    // from the entry. Null stays null — the UI says "waiting", never invents one.
    const prices = await this.market
      .prices(opportunities.map((o) => o.coin))
      .catch(() => ({}) as Record<string, number>);

    return {
      opportunities: opportunities.map((o) => ({
        ...o,
        currentPrice: prices[o.coin] ?? o.currentPrice ?? null,
      })),
      pairsChecked: diagnostics.pairsChecked,
      exchanges: diagnostics.exchanges,
      passed: diagnostics.passed,
      durationMs: diagnostics.durationMs,
      scannedAt: diagnostics.scannedAt,
    };
  }

  /* ── Universe & fetching ─────────────────────────────────────────── */

  private scanTimeframes(request?: ScanRequest): Timeframe[] {
    const all = this.orchestrator.requiredTimeframes();
    if (!request || request.timeframe === "ALL") return all;
    return all.includes(request.timeframe) ? [request.timeframe] : all;
  }

  /**
   * The bounded universe: majors first (always), then whatever else the enabled
   * exchanges list, up to the cap. Each base symbol is assigned to ONE exchange —
   * Binance when it lists it (it has the socket and the derivatives feed), Bybit
   * otherwise — so a symbol is never scanned twice, and Bybit-only coins still
   * surface.
   */
  private universe(request?: ScanRequest): UniversePair[] {
    const wantExchange = request?.exchange && request.exchange !== "ALL" ? request.exchange : null;
    const wantMarket = request?.market && request.market !== "ALL" ? request.market : null;

    const exchanges = enabledExchanges()
      .map((e) => e.id)
      .filter((id) => !wantExchange || id.toUpperCase() === wantExchange.toUpperCase());

    const priority =
      this.config.scan.priority.length > 0 ? this.config.scan.priority : [...DEFAULT_UNIVERSE];

    const assigned = new Map<string, ExchangeId>();

    const consider = (symbol: string, exchange: ExchangeId): void => {
      if (assigned.has(symbol)) return;
      const listsPerp = this.registry.lists(exchange, { symbol, marketType: "PERPETUAL" });
      const listsSpot = this.registry.lists(exchange, { symbol, marketType: "SPOT" });
      if (wantMarket === "PERPETUAL" && !listsPerp) return;
      if (wantMarket === "SPOT" && !listsSpot) return;
      if (!listsPerp && !listsSpot) return;
      assigned.set(symbol, exchange);
    };

    // 1 · Majors, in priority order, preferring Binance.
    for (const symbol of priority) {
      for (const exchange of exchanges) consider(symbol, exchange);
    }

    // 2 · Everything else the exchanges list, until the cap is reached.
    const cap = this.config.scan.maxSymbols;
    for (const exchange of exchanges) {
      if (assigned.size >= cap) break;
      for (const ref of this.registry.marketsOn(exchange)) {
        if (assigned.size >= cap) break;
        consider(ref.symbol, exchange);
      }
    }

    return [...assigned.entries()]
      .slice(0, cap)
      .map(([symbol, exchange]) => ({ symbol, exchange }));
  }

  /** Fetch a symbol's closed candles for each timeframe, tolerating gaps. */
  private async fetchCandles(
    symbol: string,
    exchange: ExchangeId,
    timeframes: Timeframe[],
  ): Promise<Partial<Record<Timeframe, readonly Candle[]>>> {
    const out: Partial<Record<Timeframe, readonly Candle[]>> = {};

    const results = await Promise.allSettled(
      timeframes.map(async (timeframe) => ({
        timeframe,
        candles: await this.market.candles({ symbol, exchange, timeframe, limit: 320 }),
      })),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.candles.length > 0) {
        out[result.value.timeframe] = result.value.candles;
      }
    }

    return out;
  }
}
