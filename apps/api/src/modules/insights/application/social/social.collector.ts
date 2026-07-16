import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { SocialSignal } from "@aegis/contracts";

/**
 * Social intelligence — LIVE, from Reddit's public JSON feeds. Free, no key.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY NUMBER HERE IS MEASURED FROM THE POSTS. NONE IS DECORATED.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The contract demands numbers that are easy to fake and expensive to mean:
 *
 *   `mentionZScore`   — measured against this collector's OWN accumulated
 *                       baseline (rolling mention history per coin). On a fresh
 *                       boot the baseline is thin and the score sits near zero —
 *                       honest: we cannot call a spike a spike until we have
 *                       watched normal for a while. It sharpens as history grows.
 *
 *   `sentiment`       — deterministic keyword scoring over titles, weighted by
 *                       upvotes. Rules you can read (same doctrine as the news
 *                       classifier, ADR: no AI, no vibes) — crude and honest.
 *
 *   `astroturfRatio`  — the AUTHOR-CONCENTRATION proxy: how much of the chatter
 *                       comes from how few accounts. Ten mentions from ten
 *                       people is a crowd; ten from two accounts is a campaign.
 *                       (True account-age analysis needs per-author API calls;
 *                       concentration is what the data in hand actually proves.)
 *
 *   `corroborated`    — ≥3 distinct authors AND concentration under the block
 *                       threshold. Measured, not asserted.
 *
 * Context, never a decision (ADR-023 §5): nothing here creates, sizes or blocks
 * a signal. It tells the trader who is talking — and whether the crowd is real.
 */
@Injectable()
export class SocialCollector implements OnApplicationBootstrap {
  private readonly logger = new Logger(SocialCollector.name);

  private signals: SocialSignal[] = [];
  private healthy = false;

  /** Rolling mention counts per coin, one entry per collection pass (max 72 ≈ 3 days hourly). */
  private readonly history = new Map<string, number[]>();
  private static readonly HISTORY_LIMIT = 72;
  private static readonly SUBREDDITS = "CryptoCurrency+CryptoMarkets+Bitcoin+ethtrader+altcoin";
  private static readonly ASTROTURF_BLOCK = 40;

  async onApplicationBootstrap(): Promise<void> {
    await this.collect().catch(() => undefined);
  }

  @Interval(30 * 60 * 1000)
  async refresh(): Promise<void> {
    await this.collect().catch((error) =>
      this.logger.debug({ err: error }, "social collection failed — keeping the last pass"),
    );
  }

  /** The current, measured social read. Empty when quiet or when Reddit is dark. */
  current(): SocialSignal[] {
    return this.signals;
  }

  status(): { live: boolean; signals: number } {
    return { live: this.healthy, signals: this.signals.length };
  }

  /* ── Collection ──────────────────────────────────────────────────── */

  private async collect(now = Date.now()): Promise<void> {
    const posts = await this.fetchHot();
    if (posts === null) {
      this.healthy = false;
      return; // Reddit unreachable — keep the previous pass rather than lie with [].
    }
    this.healthy = true;

    /* Count mentions, engagement and authors per coin. */
    const perCoin = new Map<
      string,
      { mentions: number; authors: Set<string>; sentimentWeighted: number; weight: number; top: { title: string; ups: number } }
    >();

    for (const post of posts) {
      const text = `${post.title}`.toLowerCase();
      const coins = coinsIn(text);
      if (coins.length === 0) continue;

      const tone = toneOf(text);
      const weight = Math.max(1, Math.log10(1 + post.ups));

      for (const coin of coins) {
        const entry =
          perCoin.get(coin) ??
          { mentions: 0, authors: new Set<string>(), sentimentWeighted: 0, weight: 0, top: { title: post.title, ups: -1 } };
        entry.mentions += 1;
        entry.authors.add(post.author);
        entry.sentimentWeighted += tone * weight;
        entry.weight += weight;
        if (post.ups > entry.top.ups) entry.top = { title: post.title, ups: post.ups };
        perCoin.set(coin, entry);
      }
    }

    /* Advance every tracked coin's baseline — including zeros, or silence would
     * never lower an average. */
    const tracked = new Set([...this.history.keys(), ...perCoin.keys()]);
    for (const coin of tracked) {
      const series = this.history.get(coin) ?? [];
      series.push(perCoin.get(coin)?.mentions ?? 0);
      if (series.length > SocialCollector.HISTORY_LIMIT) series.shift();
      this.history.set(coin, series);
    }

    /* Build the signals — only coins with a real conversation (3+ mentions). */
    const out: SocialSignal[] = [];
    for (const [coin, entry] of perCoin) {
      if (entry.mentions < 3) continue;

      const concentration = Math.round((1 - entry.authors.size / entry.mentions) * 100);
      const corroborated =
        entry.authors.size >= 3 && concentration <= SocialCollector.ASTROTURF_BLOCK;

      out.push({
        id: `social:${coin}:${now}`,
        coin,
        mentionZScore: round2(this.zScore(coin, entry.mentions)),
        sentiment: round2(clamp(entry.weight > 0 ? entry.sentimentWeighted / entry.weight : 0, -1, 1)),
        astroturfRatio: Math.max(0, Math.min(100, concentration)),
        corroborated,
        topNarrative: entry.top.title.slice(0, 140),
        at: new Date(now).toISOString(),
      });
    }

    out.sort((a, b) => b.mentionZScore - a.mentionZScore);
    this.signals = out.slice(0, 8);

    this.logger.log(
      `Social pass: ${posts.length} posts → ${perCoin.size} coins mentioned, ${this.signals.length} signal(s)`,
    );
  }

  /** SDs above this coin's own rolling baseline. Zero until history earns meaning. */
  private zScore(coin: string, current: number): number {
    const series = this.history.get(coin) ?? [];
    if (series.length < 6) return 0; // a baseline of five points is not a baseline

    const past = series.slice(0, -1); // exclude the value being scored (trailing, never self)
    const mean = past.reduce((s, x) => s + x, 0) / past.length;
    const variance = past.reduce((s, x) => s + (x - mean) ** 2, 0) / past.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) return 0;

    return (current - mean) / sd;
  }

  private async fetchHot(): Promise<{ title: string; author: string; ups: number }[] | null> {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${SocialCollector.SUBREDDITS}/hot.json?limit=100&raw_json=1`,
        {
          headers: { "user-agent": "aegis-signal/1.0 (market context collector)" },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) return null;

      const body = (await response.json()) as {
        data?: { children?: { data?: { title?: string; author?: string; ups?: number } }[] };
      };

      return (body.data?.children ?? [])
        .map((c) => c.data)
        .filter((d): d is { title: string; author: string; ups: number } =>
          Boolean(d?.title && d?.author),
        )
        .map((d) => ({ title: d.title, author: d.author, ups: d.ups ?? 0 }));
    } catch {
      return null;
    }
  }
}

/* ── Coin matching — tickers and names, word-boundary, no substrings ── */

const COIN_PATTERNS: [string, RegExp][] = [
  ["BTC", /\b(btc|bitcoin)\b/],
  ["ETH", /\b(eth|ethereum|ether)\b/],
  ["SOL", /\b(sol|solana)\b/],
  ["BNB", /\bbnb\b/],
  ["XRP", /\b(xrp|ripple)\b/],
  ["ADA", /\b(ada|cardano)\b/],
  ["AVAX", /\b(avax|avalanche)\b/],
  ["DOGE", /\b(doge|dogecoin)\b/],
  ["LINK", /\b(link|chainlink)\b/],
  ["ARB", /\b(arb|arbitrum)\b/],
  ["OP", /\boptimism\b/],
  ["DOT", /\b(dot|polkadot)\b/],
  ["ATOM", /\b(atom|cosmos)\b/],
  ["NEAR", /\bnear protocol\b|\b\$near\b/],
  ["APT", /\b(apt|aptos)\b/],
  ["SUI", /\bsui\b/],
  ["TON", /\b(ton|toncoin)\b/],
  ["LTC", /\b(ltc|litecoin)\b/],
  ["INJ", /\b(inj|injective)\b/],
];

function coinsIn(text: string): string[] {
  const out: string[] = [];
  for (const [coin, pattern] of COIN_PATTERNS) {
    if (pattern.test(text)) out.push(coin);
  }
  return out;
}

/* ── Deterministic tone — rules you can read, not vibes ──────────────── */

const BULLISH = /\b(bull|bullish|moon|pump|rally|ath|all.time.high|breakout|surge|soar|accumulat|buy the dip|undervalued)\b/;
const BEARISH = /\b(bear|bearish|crash|dump|plunge|collapse|capitulat|liquidat|scam|rug|fraud|sell.off|bubble|overvalued)\b/;

function toneOf(text: string): number {
  const bull = BULLISH.test(text);
  const bear = BEARISH.test(text);
  if (bull && !bear) return 1;
  if (bear && !bull) return -1;
  return 0;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
