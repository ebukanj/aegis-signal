import type { InsightsFeed } from "@aegis/contracts";

/**
 * Mock insights feed.
 *
 * Shaped exactly as the AI/Intelligence layer will emit it, so swapping the mock
 * for the API changes one function. The frontend renders these; it never derives
 * them (AGENTS.md §6).
 */

const now = Date.now();
const ago = (minutes: number) =>
  new Date(now - minutes * 60_000).toISOString();
const ahead = (hours: number) =>
  new Date(now + hours * 3_600_000).toISOString();

export function getMockInsights(): InsightsFeed {
  return {
    /**
     * The veto. While one of these is live, NO strategy may signal on that coin.
     * Two independent tier-1 sources are required before it fires.
     */
    riskFlags: [
      {
        id: "flag-1",
        coin: "SEI",
        kind: "EXPLOIT",
        headline: "Bridge exploit — roughly $14M drained",
        detail:
          "A vulnerability in the canonical bridge was exploited overnight. The team has paused withdrawals. Every signal on SEI is blocked until the situation resolves — no strategy gets an opinion on a coin that is actively bleeding.",
        sources: ["The Block", "Official team post"],
        raisedAt: ago(96),
        blockedUntil: ahead(68),
      },
    ],

    summary: {
      summary:
        "Majors are trending cleanly — BTC and ETH are both holding above their 200-day averages, and volatility is normal rather than violent. That favours breakout and pullback setups and suppresses mean-reversion, which is why Reversal is currently standing down. Capital is beginning to rotate out of BTC and into large-cap alts, but it is early: dominance has only just started falling and one week does not make an alt season. Funding across perpetuals is mildly positive — traders are leaning long, but not yet crowded enough to be fuel for a squeeze.",
      watching: [
        "BTC dominance rolling over — if it holds, alts get the bid",
        "Funding creeping up on SOL and ARB; not crowded yet, but worth watching",
        "SEI exploit is contained so far and has not spread to other bridges",
        "CPI print on Thursday — the platform will suppress signals in the window around it",
      ],
      generatedAt: ago(12),
      model: "claude-opus-4-8",
    },

    news: [
      {
        id: "news-1",
        headline: "Firedancer mainnet date confirmed for next quarter",
        summary:
          "Solana's second validator client has a shipping date. It roughly doubles throughput and, more importantly, removes the single-client failure risk that has caused past outages.",
        source: "Official announcement",
        tier: "TIER_1",
        coins: ["SOL"],
        impact: "BULLISH",
        publishedAt: ago(42),
        url: null,
      },
      {
        id: "news-2",
        headline: "Major exchange confirms ARB perpetual listing",
        summary:
          "Confirmed by the exchange itself, not a rumour account. Listings tend to produce a short, sharp move that decays within days — the platform treats this as a catalyst with a short half-life, not a thesis.",
        source: "Exchange announcement",
        tier: "TIER_1",
        coins: ["ARB"],
        impact: "BULLISH",
        publishedAt: ago(115),
        url: null,
      },
      {
        id: "news-3",
        headline: "SEI bridge exploited — withdrawals paused",
        summary:
          "Roughly $14M drained through a bridge vulnerability. This is the story behind the active risk flag: signals on SEI are blocked.",
        source: "The Block",
        tier: "TIER_1",
        coins: ["SEI"],
        impact: "BEARISH",
        publishedAt: ago(96),
        url: null,
      },
      {
        id: "news-4",
        headline: "US CPI print due Thursday 13:30 UTC",
        summary:
          "A tier-1 macro event. The platform suppresses all futures signals in the 15 minutes either side — a stop placed into a CPI candle is not a stop, it is a donation.",
        source: "Economic calendar",
        tier: "TIER_1",
        coins: [],
        impact: "NEUTRAL",
        publishedAt: ago(240),
        url: null,
      },
      {
        id: "news-5",
        headline: "Anonymous account claims 'major TIA partnership incoming'",
        summary:
          "Single source, no corroboration, account under 90 days old. The platform will not act on this and neither should you — it is recorded here only so you know we saw it and rejected it.",
        source: "Social media",
        tier: "TIER_3",
        coins: ["TIA"],
        impact: "NEUTRAL",
        publishedAt: ago(28),
        url: null,
      },
    ],

    social: [
      {
        id: "soc-1",
        coin: "SOL",
        mentionZScore: 3.4,
        sentiment: 0.62,
        astroturfRatio: 9,
        corroborated: true,
        topNarrative:
          "Firedancer shipping date — discussion is dominated by developers and researchers, not by promoters.",
        at: ago(20),
      },
      {
        id: "soc-2",
        coin: "ARB",
        mentionZScore: 2.8,
        sentiment: 0.51,
        astroturfRatio: 22,
        corroborated: true,
        topNarrative:
          "Listing confirmation. Elevated bot share but below the block threshold — real people are talking too.",
        at: ago(65),
      },
      {
        id: "soc-3",
        coin: "PEPE",
        mentionZScore: 5.1,
        sentiment: 0.88,
        astroturfRatio: 67,
        corroborated: false,
        topNarrative:
          "Coordinated hype. Two thirds of the spike comes from accounts under 90 days old — this is manufactured, and any signal built on it is blocked.",
        at: ago(35),
      },
    ],

    fundamentals: [
      {
        id: "fun-1",
        coin: "SOL",
        kind: "EXCHANGE_OUTFLOW",
        headline: "Coins leaving exchanges",
        measured: "−$18.4M netflow (24h)",
        bullish: true,
        at: ago(30),
      },
      {
        id: "fun-2",
        coin: "SOL",
        kind: "DEV_ACTIVITY",
        headline: "Developer activity rising alongside the narrative",
        measured: "+34% commit velocity (30d)",
        bullish: true,
        at: ago(180),
      },
      {
        id: "fun-3",
        coin: "PEPE",
        kind: "WHALE_DISTRIBUTION",
        headline: "Whales sending to exchanges while retail is euphoric",
        measured: "+$9.2M to exchanges (24h)",
        bullish: false,
        at: ago(40),
      },
      {
        id: "fun-4",
        coin: "ARB",
        kind: "TVL_CHANGE",
        headline: "Total value locked climbing",
        measured: "+12.6% (7d)",
        bullish: true,
        at: ago(300),
      },
    ],
  };
}
