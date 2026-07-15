import { Injectable } from "@nestjs/common";
import { insightSchema, type Insight } from "@aegis/contracts";
import type { IInsightCollector, RawItem } from "../../domain/collector";
import { EntityExtractor } from "../enrichment/entity.extractor";
import { ClassificationEngine } from "../classifiers/classification.engine";

/**
 * Raw provider items → canonical, classified insights.
 *
 * This is the layer the spec insists on: *no provider-specific format may escape*.
 * Everything a collector produced is reduced here to the one `Insight` shape, with
 * its entities extracted and its category / severity / impact classified — all
 * deterministically, so the same article always yields the same insight, and the
 * output is validated against the contract before it leaves.
 */
@Injectable()
export class NormalizationPipeline {
  constructor(
    private readonly entities: EntityExtractor,
    private readonly classifier: ClassificationEngine,
  ) {}

  normalize(collector: IInsightCollector, raw: RawItem, now: number): Insight {
    const text = `${raw.title} ${raw.description}`;
    const entities = this.entities.extract(text);
    const coins = this.entities.coins(entities);
    const classification = this.classifier.classify(raw.title, raw.description, entities);

    const dedupeKey = fingerprint(raw.title);

    return insightSchema.parse({
      /* Deterministic id from the fingerprint — the same story always gets the same
       * id, which is what makes collection idempotent across runs. */
      id: `ins:${dedupeKey}`,
      provider: collector.provider,
      source: collector.source,
      sources: [collector.source],
      title: raw.title,
      description: raw.description,
      url: raw.url,
      language: raw.language,
      publishedAt: raw.publishedAt,
      collectedAt: now,
      category: classification.category,
      severity: classification.severity,
      impact: classification.impact,
      entities,
      coins,
      tags: classification.tags,
      confidence: classification.confidence,
      dedupeKey,
    });
  }
}

/**
 * The fingerprint that merges the same story across outlets.
 *
 * Two outlets rarely use the identical headline, so we normalize hard: lowercase,
 * strip punctuation and stop-words, sort the significant words, and hash. "Binance
 * to delist FTT token" and "FTT token delisted by Binance" collapse to the same
 * key — which is the whole point, because a Risk Flag needs to know those are ONE
 * event corroborated twice, not two events.
 */
export function fingerprint(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    /* Light stemming so "delist" and "delisted", "hack" and "hacked" collapse — two
     * outlets rarely use the identical verb tense, and a fingerprint that split on
     * tense would fail to merge exactly the corroboration a veto needs. */
    .map(stem)
    .sort();

  /* Keep the most significant handful, so a long headline and its shorter
   * re-write still match on their shared core. */
  const core = [...new Set(words)].slice(0, 8).join(" ");
  return fnv(core);
}

/** Crude but deterministic suffix stripping. Not linguistics — just enough that
 * tense and plurals do not split a fingerprint. Only applied to longer words so
 * short tickers and names are left intact. */
function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "amid", "says", "will", "has", "have",
  "after", "over", "its", "his", "her", "their", "this", "that", "are", "was", "were",
  "new", "now", "how", "why", "what", "who", "you", "your", "not", "but", "all", "can",
]);

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
