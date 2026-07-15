import { Logger } from "@nestjs/common";
import type { SourceTier } from "@aegis/contracts";
import type { IInsightCollector, RawItem } from "../../domain/collector";
import { parseFeed } from "./rss.parser";

/**
 * A collector backed by an RSS/Atom feed.
 *
 * All the real news collectors are instances of this — the only thing that differs
 * between Cointelegraph and Decrypt is a URL and a name. That is the collector
 * framework working: a new outlet is a new row in the registry, not new code.
 *
 * It is defensive by default. A feed that times out, returns a 500, or serves
 * garbage must fail in a way the registry can catch and report, without taking the
 * other collectors down — so `collect` throws a clear error rather than returning a
 * half-batch, and the registry decides what a failure means for health.
 */
export class RssCollector implements IInsightCollector {
  private readonly logger = new Logger(RssCollector.name);

  constructor(
    readonly provider: string,
    readonly source: string,
    readonly tier: SourceTier,
    private readonly url: string,
    /** Injected so tests can supply a fixed feed and stay deterministic and offline. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async collect(): Promise<RawItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await this.fetchImpl(this.url, {
        signal: controller.signal,
        headers: { "user-agent": "AegisSignal/1.0 (+insights)", accept: "application/rss+xml, application/xml, text/xml" },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`${this.source} returned HTTP ${response.status}`);
      }

      const xml = await response.text();
      const items = parseFeed(xml);

      this.logger.debug(`${this.source}: ${items.length} items`);
      return items;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * The real news feeds. Tiers reflect how much a headline is worth as CORROBORATION
 * for a veto — the wire services and exchange blogs are TIER_1; aggregators and
 * commentary are TIER_2.
 *
 * Exchange-announcement and economic-calendar collectors are named here as
 * interfaces to be filled: they need bespoke providers (an exchange's own
 * announcement API, an econ-calendar source) rather than a public RSS feed, and
 * the architecture is ready for them — a collector is a collector.
 */
export const NEWS_FEEDS: ReadonlyArray<{
  provider: string;
  source: string;
  tier: SourceTier;
  url: string;
}> = [
  { provider: "cointelegraph", source: "Cointelegraph", tier: "TIER_1", url: "https://cointelegraph.com/rss" },
  { provider: "decrypt", source: "Decrypt", tier: "TIER_2", url: "https://decrypt.co/feed" },
  { provider: "coindesk", source: "CoinDesk", tier: "TIER_1", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { provider: "bitcoinmagazine", source: "Bitcoin Magazine", tier: "TIER_2", url: "https://bitcoinmagazine.com/feed" },
];
