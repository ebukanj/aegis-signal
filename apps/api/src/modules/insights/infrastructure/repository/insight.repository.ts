import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { insightSchema, type Insight } from "@aegis/contracts";
import { PrismaService } from "../../../../core/database/prisma.service";

/**
 * Insights, on disk. Keyed by the dedupe fingerprint, so the same story is one row
 * however many outlets ran it.
 *
 * The store is idempotent by design: collecting the same article again UPDATES the
 * existing row (extending its sources) rather than inserting a duplicate. That is
 * what lets the collection worker run every few minutes without the database
 * filling with re-runs of the same news.
 */
@Injectable()
export class InsightRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert a batch by dedupe key. Returns how many were new. */
  async upsertMany(insights: readonly Insight[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const insight of insights) {
      const existing = await this.prisma.insight.findUnique({
        where: { dedupeKey: insight.dedupeKey },
      });

      if (existing) {
        await this.prisma.insight.update({
          where: { dedupeKey: insight.dedupeKey },
          data: {
            sources: insight.sources,
            description: insight.description,
            entities: insight.entities as unknown as Prisma.InputJsonValue,
            coins: insight.coins,
            tags: insight.tags,
            confidence: insight.confidence,
          },
        });
        updated += 1;
      } else {
        await this.prisma.insight.create({ data: toRow(insight) });
        created += 1;
      }
    }

    return { created, updated };
  }

  async recent(filter: {
    since?: number;
    coins?: string[];
    category?: string;
    severity?: string;
    limit?: number;
  } = {}): Promise<Insight[]> {
    const rows = await this.prisma.insight.findMany({
      where: {
        ...(filter.since ? { publishedAt: { gte: BigInt(filter.since) } } : {}),
        ...(filter.coins?.length ? { coins: { hasSome: filter.coins } } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.severity ? { severity: filter.severity } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: filter.limit ?? 100,
    });
    return rows.map(fromRow);
  }

  /** Full-text-ish search across title/description, plus the structured filters. */
  async search(query: {
    keyword?: string;
    coin?: string;
    category?: string;
    severity?: string;
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<Insight[]> {
    const rows = await this.prisma.insight.findMany({
      where: {
        ...(query.keyword
          ? {
              OR: [
                { title: { contains: query.keyword, mode: "insensitive" } },
                { description: { contains: query.keyword, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(query.coin ? { coins: { has: query.coin.toUpperCase() } } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.from || query.to
          ? {
              publishedAt: {
                ...(query.from ? { gte: BigInt(query.from) } : {}),
                ...(query.to ? { lte: BigInt(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: query.limit ?? 100,
    });
    return rows.map(fromRow);
  }

  async count(): Promise<number> {
    return this.prisma.insight.count();
  }

  async countSince(since: number): Promise<number> {
    return this.prisma.insight.count({ where: { collectedAt: { gte: BigInt(since) } } });
  }
}

function toRow(i: Insight) {
  return {
    id: i.id,
    provider: i.provider,
    source: i.source,
    sources: i.sources,
    title: i.title,
    description: i.description,
    url: i.url,
    language: i.language,
    publishedAt: BigInt(i.publishedAt),
    collectedAt: BigInt(i.collectedAt),
    category: i.category,
    severity: i.severity,
    impact: i.impact,
    entities: i.entities as unknown as Prisma.InputJsonValue,
    coins: i.coins,
    tags: i.tags,
    confidence: i.confidence,
    dedupeKey: i.dedupeKey,
  };
}

function fromRow(row: Record<string, unknown>): Insight {
  return insightSchema.parse({
    id: row.id,
    provider: row.provider,
    source: row.source,
    sources: row.sources,
    title: row.title,
    description: row.description,
    url: row.url,
    language: row.language,
    publishedAt: Number(row.publishedAt),
    collectedAt: Number(row.collectedAt),
    category: row.category,
    severity: row.severity,
    impact: row.impact,
    entities: row.entities,
    coins: row.coins,
    tags: row.tags,
    confidence: row.confidence,
    dedupeKey: row.dedupeKey,
  });
}
