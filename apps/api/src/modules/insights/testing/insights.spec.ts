import { describe, expect, it } from "vitest";
import type { Insight } from "@aegis/contracts";
import { EntityExtractor } from "../application/enrichment/entity.extractor";
import { ClassificationEngine } from "../application/classifiers/classification.engine";
import { DeduplicationEngine } from "../application/deduplication/deduplication.engine";
import { RiskFlagGenerator } from "../application/risk-flags/risk-flag.generator";
import { NormalizationPipeline, fingerprint } from "../application/services/normalization.pipeline";
import { parseFeed } from "../infrastructure/rss/rss.parser";
import type { RawItem } from "../domain/collector";

const entities = new EntityExtractor();
const classifier = new ClassificationEngine();
const dedup = new DeduplicationEngine();
const flags = new RiskFlagGenerator();
const pipeline = new NormalizationPipeline(entities, classifier);

const collector = { provider: "test", source: "Test Wire", tier: "TIER_1" as const };
const NOW = new Date("2026-03-01T00:00:00Z").getTime();

function insightFrom(title: string, description = "", sourceCount = 1): Insight {
  const raw: RawItem = { title, description, url: "https://x", publishedAt: NOW, language: "en" };
  const i = pipeline.normalize(collector, raw, NOW);
  return { ...i, sources: Array.from({ length: sourceCount }, (_, k) => `Source ${k + 1}`) };
}

/* ══════════════════════════════════════════════════════════════════════
 *  ENTITY EXTRACTION — a dictionary, not a guess
 * ══════════════════════════════════════════════════════════════════════ */

describe("entity extraction", () => {
  it("finds coins, exchanges and stablecoins by whole-word match", () => {
    const found = entities.extract("Binance will list a new ETH pair as USDT volume surges");
    const symbols = found.map((e) => e.symbol).sort();
    expect(symbols).toContain("ETH");
    expect(symbols).toContain("BINANCE");
    expect(symbols).toContain("USDT");
  });

  it("does NOT fire on substrings — 'eth' inside 'together' is not Ethereum", () => {
    const found = entities.extract("The teams worked together on the project");
    expect(found.map((e) => e.symbol)).not.toContain("ETH");
  });

  it("returns coins separately for the veto to key on", () => {
    const found = entities.extract("Solana and Bitcoin rally");
    expect(entities.coins(found).sort()).toEqual(["BTC", "SOL"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  CLASSIFICATION — every answer is a rule you can read
 * ══════════════════════════════════════════════════════════════════════ */

describe("classification is deterministic", () => {
  it("calls an exploit CRITICAL and NEGATIVE", () => {
    const c = classifier.classify("Protocol drained in reentrancy exploit", "", []);
    expect(c.category).toBe("EXPLOIT");
    expect(c.severity).toBe("CRITICAL");
    expect(c.impact).toBe("NEGATIVE");
  });

  it("prioritises DANGER — a hack that is also a partnership is a hack", () => {
    const c = classifier.classify("Exchange hacked despite new security partnership", "", []);
    expect(c.category).toBe("HACK");
  });

  it("classifies macro events", () => {
    expect(classifier.classify("Fed holds interest rate, CPI comes in hot", "", []).category).toBe("MACRO");
  });

  it("classifies a delisting as HIGH severity", () => {
    const c = classifier.classify("Binance to delist FTT token", "", []);
    expect(c.category).toBe("DELISTING");
    expect(c.severity).toBe("HIGH");
  });

  it("falls back to GENERAL / UNKNOWN when nothing matches — never a guess", () => {
    const c = classifier.classify("A quiet day in the markets", "", []);
    expect(c.category).toBe("GENERAL");
    expect(c.impact).toBe("UNKNOWN");
    expect(c.confidence).toBeLessThan(0.3);
  });

  it("is DETERMINISTIC — the same headline always classifies the same way", () => {
    const a = classifier.classify("SEC sues major exchange", "", []);
    const b = classifier.classify("SEC sues major exchange", "", []);
    expect(a).toEqual(b);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  DEDUPLICATION — one story, counted once, sources preserved
 * ══════════════════════════════════════════════════════════════════════ */

describe("deduplication", () => {
  it("merges the same story from two outlets into one, keeping both sources", () => {
    const a = insightFrom("Binance to delist FTT token");
    const b = { ...insightFrom("FTT token delisted by Binance"), sources: ["CoinDesk"] };
    /* The fingerprints should match despite the re-worded headline. */
    expect(a.dedupeKey).toBe(b.dedupeKey);

    const merged = dedup.dedupe([{ ...a, sources: ["Cointelegraph"] }, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources.sort()).toEqual(["CoinDesk", "Cointelegraph"]);
  });

  it("keeps the EARLIEST publication time — who broke it", () => {
    const early = { ...insightFrom("Ethereum upgrade ships"), publishedAt: NOW, sources: ["A"] };
    const late = { ...insightFrom("Ethereum upgrade ships"), publishedAt: NOW + 10_000, sources: ["B"] };
    const merged = dedup.dedupe([late, early]);
    expect(merged[0].publishedAt).toBe(NOW);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  RISK FLAGS — corroborated danger, and only that
 * ══════════════════════════════════════════════════════════════════════ */

describe("risk flag generation", () => {
  it("raises a veto on a corroborated exploit affecting a named coin", () => {
    const insight = insightFrom("Solana DeFi protocol exploited, funds drained", "", 2);
    const raised = flags.generate([insight]);
    expect(raised.length).toBeGreaterThan(0);
    const sol = raised.find((f) => f.coin === "SOL");
    expect(sol?.kind).toBe("EXPLOIT");
    expect(sol?.sources.length).toBeGreaterThanOrEqual(2);
  });

  it("REFUSES a veto on a SINGLE-source story — one rumour cannot suppress a coin", () => {
    const insight = insightFrom("Solana protocol exploited", "", 1);
    expect(flags.generate([insight])).toHaveLength(0);
  });

  it("does NOT flag ordinary good news — a listing is awareness, not a veto", () => {
    const insight = insightFrom("Coinbase lists new ETH staking product", "", 3);
    expect(flags.generate([insight])).toHaveLength(0);
  });

  it("does NOT flag a market-wide security story with no coin to block", () => {
    const insight = insightFrom("General phishing campaign targets crypto users", "", 2);
    expect(flags.generate([insight])).toHaveLength(0);
  });

  it("expires flags — a block is not forever", () => {
    const insight = insightFrom("BTC exchange hacked", "", 2);
    const [flag] = flags.generate([insight]);
    expect(flags.isActive(flag, NOW)).toBe(true);
    expect(flags.isActive(flag, NOW + 1000 * 3600 * 1000)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  NORMALIZATION & THE RSS PARSER
 * ══════════════════════════════════════════════════════════════════════ */

describe("normalization produces the one canonical shape", () => {
  it("classifies, extracts entities, and stamps a deterministic id", () => {
    const raw: RawItem = {
      title: "Ethereum network upgrade goes live on mainnet",
      description: "The long-awaited upgrade...",
      url: "https://x",
      publishedAt: NOW,
      language: "en",
    };
    const a = pipeline.normalize(collector, raw, NOW);
    const b = pipeline.normalize(collector, raw, NOW);
    expect(a.id).toBe(b.id); // deterministic
    expect(a.category).toBe("INFRASTRUCTURE");
    expect(a.coins).toContain("ETH");
  });

  it("fingerprints re-worded headlines to the same key", () => {
    expect(fingerprint("Binance to delist FTT token")).toBe(fingerprint("FTT token delisted by Binance"));
    expect(fingerprint("Bitcoin hits new high")).not.toBe(fingerprint("Ethereum hits new high"));
  });
});

describe("the RSS parser", () => {
  it("parses items from an RSS feed, stripping CDATA and markup", () => {
    const xml = `<rss><channel>
      <item>
        <title>Bitcoin surges past resistance</title>
        <description><![CDATA[<p>Price action <b>strong</b></p>]]></description>
        <link>https://example.com/a</link>
        <pubDate>Wed, 01 Mar 2026 00:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Ethereum upgrade ships</title>
        <description>Plain text</description>
        <link>https://example.com/b</link>
        <pubDate>Wed, 01 Mar 2026 01:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;

    const items = parseFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Bitcoin surges past resistance");
    expect(items[0].description).toBe("Price action strong"); // markup stripped
    expect(items[0].url).toBe("https://example.com/a");
  });

  it("skips an item with no title rather than losing the batch", () => {
    const xml = `<rss><channel>
      <item><description>orphan</description></item>
      <item><title>Real story</title></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Real story");
  });
});
