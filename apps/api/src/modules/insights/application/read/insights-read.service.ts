import { Injectable } from "@nestjs/common";
import {
  type Insight,
  type InsightsFeed,
  type InsightTimeline,
  type NewsItem,
  type NewsImpact,
  type SourceTier,
} from "@aegis/contracts";
import { InsightsService } from "../services/insights.service";
import { InsightRepository } from "../../infrastructure/repository/insight.repository";
import { SocialCollector } from "../social/social.collector";

/**
 * The read side — the shapes the frontend Insights page already speaks.
 *
 * The engine's canonical `Insight` is richer than the frontend's `NewsItem`; this
 * projects one to the other. What the engine does NOT have live yet — social
 * intelligence, on-chain fundamentals, an AI market summary — is returned HONESTLY
 * EMPTY and labelled, never faked. A "future-ready" architecture means a clean
 * interface and an empty result, not invented data (the whole point of this
 * platform).
 */
@Injectable()
export class InsightsReadService {
  constructor(
    private readonly insights: InsightsService,
    private readonly repository: InsightRepository,
    private readonly social: SocialCollector,
  ) {}

  /** The Insights page feed: real news + real risk flags; social/fundamentals empty. */
  async feed(now = Date.now()): Promise<InsightsFeed> {
    const recent = await this.repository.recent({ limit: 40 });

    return {
      riskFlags: this.insights.activeRiskFlags(now),
      summary: {
        /*
         * A DETERMINISTIC context summary, not an AI one. AI summarization is out of
         * scope this milestone (SOLUTION_ARCHITECTURE §10); rather than fabricate
         * prose, this states what the feed literally contains, and labels its model
         * "deterministic" so nobody mistakes it for the AI read.
         */
        summary: this.summarise(recent, now),
        watching: this.watching(recent),
        generatedAt: new Date(now).toISOString(),
        model: "deterministic",
      },
      news: recent.map(toNewsItem),
      /* LIVE — measured from Reddit's public feeds (see SocialCollector). Empty
       * means genuinely quiet, or Reddit dark — never faked either way. */
      social: this.social.current(),
      fundamentals: [],
    };
  }

  /** Everything the platform knows about one asset's context. */
  async assetContext(coin: string, now = Date.now()): Promise<{
    coin: string;
    recentNews: NewsItem[];
    activeRiskFlags: string[];
  }> {
    const news = await this.repository.recent({ coins: [coin.toUpperCase()], limit: 20 });
    const flags = this.insights
      .activeRiskFlags(now)
      .filter((f) => f.coin === coin.toUpperCase())
      .map((f) => f.headline);

    return { coin: coin.toUpperCase(), recentNews: news.map(toNewsItem), activeRiskFlags: flags };
  }

  /** A filterable timeline. */
  async timeline(scope: InsightTimeline["scope"], key: string | null): Promise<InsightTimeline> {
    const items = await this.repository.recent(
      scope === "ASSET" && key
        ? { coins: [key.toUpperCase()], limit: 100 }
        : scope === "MACRO"
          ? { category: "MACRO", limit: 100 }
          : { limit: 100 },
    );
    return { scope, key, items };
  }

  async search(query: Parameters<InsightRepository["search"]>[0]): Promise<Insight[]> {
    return this.repository.search(query);
  }

  /* ── Projection + the deterministic summary ────────────────────── */

  private summarise(recent: readonly Insight[], now: number): string {
    if (recent.length === 0) {
      return "No market-moving news collected in the current window. This is a factual statement about the feed, not a market call.";
    }

    const dayAgo = now - 86_400_000;
    const today = recent.filter((i) => i.publishedAt >= dayAgo);
    const critical = today.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
    const topCoins = countCoins(today).slice(0, 4);

    const parts = [`${today.length} stories in the last 24h`];
    if (critical.length > 0) parts.push(`${critical.length} high-severity`);
    if (topCoins.length > 0) parts.push(`most active: ${topCoins.join(", ")}`);

    return `${parts.join(" · ")}. Context only — the Insights Engine reports what happened; it never says whether to trade.`;
  }

  private watching(recent: readonly Insight[]): string[] {
    return recent
      .filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH")
      .slice(0, 5)
      .map((i) => `${i.category}: ${i.title}`);
  }
}

/* ── The projection to the frontend's NewsItem ─────────────────────── */

function toNewsItem(insight: Insight): NewsItem {
  return {
    id: insight.id,
    headline: insight.title,
    summary: insight.description,
    source: insight.source,
    tier: tierFor(insight),
    coins: insight.coins,
    impact: impactFor(insight.impact),
    publishedAt: new Date(insight.publishedAt).toISOString(),
    url: insight.url,
  };
}

/** The canonical impact → the frontend's bullish/bearish/neutral. UNKNOWN reads as NEUTRAL. */
function impactFor(impact: Insight["impact"]): NewsImpact {
  if (impact === "POSITIVE") return "BULLISH";
  if (impact === "NEGATIVE") return "BEARISH";
  return "NEUTRAL";
}

/** A story carried by 2+ sources is at least TIER_1-corroborated for the UI badge. */
function tierFor(insight: Insight): SourceTier {
  if (insight.sources.length >= 2) return "TIER_1";
  return insight.confidence >= 0.7 ? "TIER_2" : "TIER_3";
}

function countCoins(insights: readonly Insight[]): string[] {
  const counts = new Map<string, number>();
  for (const i of insights) for (const c of i.coins) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort(([, a], [, b]) => b - a).map(([c]) => c);
}
