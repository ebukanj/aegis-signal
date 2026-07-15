import type { SourceTier } from "@aegis/contracts";

/**
 * A raw item, straight from a provider, before normalization.
 *
 * This is the ONLY shape a collector is allowed to emit. Whatever a provider's
 * feed actually looks like — RSS, JSON, an exchange's bespoke announcement API —
 * the collector's job is to reduce it to exactly this. No provider-specific field
 * escapes the collector, so the rest of the engine never learns what an outlet's
 * XML looks like, and a new source is a new collector and nothing else.
 */
export interface RawItem {
  title: string;
  description: string;
  url: string | null;
  /** Epoch ms. The collector parses whatever date format the provider used. */
  publishedAt: number;
  language: string;
}

/**
 * A pluggable source of intelligence.
 *
 * Every collector is replaceable and independent: one going down (a feed changes
 * its URL, an outlet blocks the scraper) must never take the others with it. The
 * registry runs them with `allSettled`, and a failing collector degrades loudly
 * rather than crashing the pipeline — a dead source is the failure that hides as
 * "no news", and the health signal is how it is caught.
 */
export interface IInsightCollector {
  /** Stable id, e.g. "cointelegraph". Appears in every insight it produces. */
  readonly provider: string;
  /** Human-facing name, e.g. "Cointelegraph". */
  readonly source: string;
  /** How much a headline from here is worth. A primary/official source is TIER_1. */
  readonly tier: SourceTier;

  /** Fetch and reduce to raw items. Throws on failure; the registry handles it. */
  collect(): Promise<RawItem[]>;
}
