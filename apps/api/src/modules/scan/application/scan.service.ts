import { Injectable, Logger } from "@nestjs/common";
import type { Candle, ExchangeId, ScanRequest, ScanResult, Timeframe } from "@aegis/contracts";

import { AppConfigService } from "../../../config/app-config.service";
import { MarketService } from "../../market/application/market.service";
import { SymbolRegistry } from "../../market/domain/symbol-registry";
import { DEFAULT_UNIVERSE, enabledExchanges } from "../../market/market.config";
import { SignalService } from "../../signals/application/services/signal.service";
import { SignalReadService } from "../../signals/application/read/signal-read.service";
import { WatchlistService } from "../../auth/application/watchlist.service";
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
  /** WHY candidates died, grouped and counted — the evidence under a thin result. */
  topRejections: { reason: string; count: number }[];
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
  /** One sweep at a time, whoever asked for it — the worker or a user. */
  private sweeping = false;

  constructor(
    private readonly orchestrator: ScanOrchestrator,
    private readonly market: MarketService,
    private readonly registry: SymbolRegistry,
    private readonly signals: SignalService,
    private readonly read: SignalReadService,
    private readonly watchlist: WatchlistService,
    private readonly config: AppConfigService,
  ) {}

  /* ── The background sweep (the worker calls this) ─────────────────── */

  /**
   * One full pass over the universe: find candidates, publish them, record the
   * diagnostics. Returns how many pairs were checked and how many setups passed.
   */
  async sweep(request?: ScanRequest): Promise<SweepDiagnostics> {
    if (this.sweeping) {
      // Never stack sweeps — the exchanges rate-limit the whole platform, not a
      // caller. The one already running will publish everything this one would.
      return (
        this.last ?? {
          pairsChecked: 0,
          exchanges: enabledExchanges().length,
          passed: 0,
          durationMs: 0,
          scannedAt: new Date().toISOString(),
          topRejections: [],
        }
      );
    }
    this.sweeping = true;
    try {
      return await this.runSweep(request);
    } finally {
      this.sweeping = false;
    }
  }

  private async runSweep(request?: ScanRequest): Promise<SweepDiagnostics> {
    const started = Date.now();
    const now = Date.now();

    const timeframes = this.scanTimeframes(request);
    const pairs = await this.universe(request);

    // BTC is the correlation reference every symbol is measured against. Fetch it
    // once per sweep, from Binance, and reuse it — never per symbol.
    const btcByTimeframe = await this.fetchCandles("BTC", "BINANCE", timeframes);

    const all: SignalCandidate[] = [];
    const rejections = new Map<string, number>();
    let checked = 0;

    /*
     * Two symbols in flight — enough to overlap the network waits, few enough
     * that the CPU-heavy stages (indicators, pattern detection are synchronous
     * math) leave gaps for the event loop. The first version ran four lanes and
     * starved the API: /health took seven seconds DURING a sweep, which reads as
     * an outage. A background job must never make the platform unreachable.
     */
    const queue = [...pairs];
    const lane = async (): Promise<void> => {
      for (;;) {
        // A real timer gap between symbols — not just setImmediate. The pipeline's
        // compute is synchronous bursts; a 25ms breath per symbol costs ~1.5s
        // across a whole sweep and keeps HTTP, sockets and settlements responsive
        // throughout. A background job must never read as an outage.
        await new Promise((resolve) => setTimeout(resolve, 25));

        const pair = queue.shift();
        if (!pair) return;
        const { symbol, exchange } = pair;

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
            onReject: (reason) => rejections.set(reason, (rejections.get(reason) ?? 0) + 1),
          });
          all.push(...candidates);
        } catch (error) {
          this.logger.debug({ symbol, exchange, err: error }, "Symbol scan failed — skipped");
        }
      }
    };
    await Promise.all([lane(), lane()]);

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
      topRejections: [...rejections.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count })),
    };

    this.last = diagnostics;

    this.logger.log(
      `Scan: ${checked} pairs checked · ${all.length} passed · ${diagnostics.durationMs}ms`,
    );

    if (all.length === 0 && diagnostics.topRejections.length > 0) {
      const top = diagnostics.topRejections
        .slice(0, 4)
        .map((r) => `${r.count}× ${r.reason}`)
        .join(" | ");
      this.logger.log(`Why nothing passed: ${top}`);
    }

    return diagnostics;
  }

  /* ── On-demand scan (the Scanner page calls this) ────────────────── */

  /**
   * A scan the user asked for.
   *
   * ── Why this NEVER runs a sweep inside the request ──
   *
   * A full sweep respects the exchanges' rate limits, so it takes minutes — far
   * past any sane HTTP timeout. The first version ran it synchronously and the
   * page showed "the pipeline is unreachable" while the pipeline was working
   * perfectly. So: kick a background sweep if one is not already running, return
   * the latest completed sweep IMMEDIATELY, and say `inProgress: true` so the UI
   * polls and flips when the fresh numbers land. The user always gets an instant,
   * honest answer.
   */
  async scan(request: ScanRequest): Promise<ScanResult> {
    if (!this.sweeping) {
      void this.sweep(request).catch((error) =>
        this.logger.error({ err: error }, "User-triggered sweep failed"),
      );
    }
    return this.resultFrom(this.last, request);
  }

  /** The most recent scan, for the Scanner page's initial paint. Instant. */
  async latest(): Promise<ScanResult> {
    return this.resultFrom(this.last);
  }

  private async resultFrom(
    diagnostics: SweepDiagnostics | null,
    request?: ScanRequest,
  ): Promise<ScanResult> {
    const feed = await this.read.feed(Date.now());
    let opportunities = [...feed.prime, ...feed.validated];

    // Honour the toolbar's slice — the feed holds everything published; the
    // scanner shows the part of it the user pointed at.
    if (request) {
      if (request.exchange && request.exchange !== "ALL") {
        opportunities = opportunities.filter(
          (o) => o.exchange.toUpperCase() === request.exchange.toUpperCase(),
        );
      }
      if (request.timeframe && request.timeframe !== "ALL") {
        opportunities = opportunities.filter((o) => o.timeframe === request.timeframe);
      }
      if (request.market && request.market !== "ALL") {
        opportunities = opportunities.filter((o) => o.marketType === request.market);
      }
    }

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
      pairsChecked: diagnostics?.pairsChecked ?? 0,
      exchanges: diagnostics?.exchanges ?? enabledExchanges().length,
      passed: diagnostics?.passed ?? 0,
      durationMs: diagnostics?.durationMs ?? 0,
      scannedAt: diagnostics?.scannedAt ?? new Date().toISOString(),
      inProgress: this.sweeping,
      topRejections: diagnostics?.topRejections ?? [],
    };
  }

  /* ── Universe & fetching ─────────────────────────────────────────── */

  private scanTimeframes(request?: ScanRequest): Timeframe[] {
    const all = this.orchestrator.requiredTimeframes();
    if (!request || request.timeframe === "ALL") return all;
    return all.includes(request.timeframe) ? [request.timeframe] : all;
  }

  /**
   * The bounded universe: WATCHLISTED coins first (always — exempt from the cap,
   * because a coin a user explicitly asked us to watch must never be dropped for
   * budget), then the configured majors, then whatever else the enabled exchanges
   * list, up to the cap. Each base symbol is assigned to ONE exchange — Binance
   * when it lists it (it has the socket and the derivatives feed), Bybit otherwise
   * — so a symbol is never scanned twice, and Bybit-only coins still surface.
   */
  private async universe(request?: ScanRequest): Promise<UniversePair[]> {
    const wantExchange = request?.exchange && request.exchange !== "ALL" ? request.exchange : null;
    const wantMarket = request?.market && request.market !== "ALL" ? request.market : null;

    const exchanges = enabledExchanges()
      .map((e) => e.id)
      .filter((id) => !wantExchange || id.toUpperCase() === wantExchange.toUpperCase());

    // Every coin any user watches — scanned first, and never dropped by the cap.
    const watched = await this.watchlist.union().catch(() => [] as string[]);

    const majors =
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

    // 1 · Watchlisted coins, then majors — in that order, preferring Binance.
    for (const symbol of [...watched, ...majors]) {
      for (const exchange of exchanges) consider(symbol, exchange);
    }

    // The cap can never truncate the priority set: a big shared watchlist simply
    // raises the ceiling for this sweep rather than evicting a watched coin.
    const cap = Math.max(this.config.scan.maxSymbols, assigned.size);

    // 2 · Everything else the exchanges list, until the cap is reached.
    for (const exchange of exchanges) {
      if (assigned.size >= cap) break;
      for (const ref of this.registry.marketsOn(exchange)) {
        if (assigned.size >= cap) break;
        consider(ref.symbol, exchange);
      }
    }

    return [...assigned.entries()].map(([symbol, exchange]) => ({ symbol, exchange }));
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
