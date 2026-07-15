import { Injectable } from "@nestjs/common";
import type { Insight } from "@aegis/contracts";

/**
 * The same story, from three outlets, is ONE insight.
 *
 * ── Why this is more than tidiness ──
 *
 * Left undeduplicated, a big story (an exchange hack, say) arrives four times as
 * four items — and a trader gets four notifications for one event and learns the
 * feed is noise. Worse, the corroboration logic breaks: a Risk Flag needs "two
 * independent tier-1 sources", and it cannot count them if the same story is
 * sitting in the database as four unrelated rows.
 *
 * So merging is not cosmetic — it is what MAKES the corroboration real. When two
 * outlets run the same story (same `dedupeKey`), they become one insight whose
 * `sources` lists both. The count of independent sources on one insight is then
 * exactly what a veto needs.
 *
 * The merge PRESERVES: every source, the EARLIEST publication time (who broke it),
 * and the richest description. It loses nothing a trader might want.
 */
@Injectable()
export class DeduplicationEngine {
  /**
   * Fold a batch so each distinct story appears once, carrying all its sources.
   */
  dedupe(insights: readonly Insight[]): Insight[] {
    const byKey = new Map<string, Insight>();

    for (const insight of insights) {
      const existing = byKey.get(insight.dedupeKey);
      byKey.set(insight.dedupeKey, existing ? this.merge(existing, insight) : insight);
    }

    return [...byKey.values()];
  }

  /**
   * Merge a new sighting of a story into the one already held. Idempotent: merging
   * the same source twice does not double it.
   */
  merge(held: Insight, incoming: Insight): Insight {
    const sources = [...new Set([...held.sources, ...incoming.sources])];

    return {
      ...held,
      /* Who broke it — the earliest timestamp wins. */
      publishedAt: Math.min(held.publishedAt, incoming.publishedAt),
      sources,
      /* The richer description is more useful to a trader. */
      description:
        incoming.description.length > held.description.length
          ? incoming.description
          : held.description,
      url: held.url ?? incoming.url,
      /* Union the entities/coins/tags — different outlets may name different assets. */
      entities: unionBy([...held.entities, ...incoming.entities], (e) => e.symbol),
      coins: [...new Set([...held.coins, ...incoming.coins])],
      tags: [...new Set([...held.tags, ...incoming.tags])],
      /* Corroboration RAISES classification confidence — two outlets agreeing on a
       * story is stronger evidence that it is what we think it is. */
      confidence: Math.min(1, Math.max(held.confidence, incoming.confidence) + (sources.length > 1 ? 0.05 : 0)),
    };
  }
}

function unionBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
  return [...seen.values()];
}
