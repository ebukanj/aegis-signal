import { Injectable, Logger } from "@nestjs/common";
import {
  publishedSignalSchema,
  type PublishedSignal,
  type SignalStatus,
} from "@aegis/contracts";
import { PrismaService } from "../../../../core/database/prisma.service";
import type { BudgetLedger } from "../../application/budget/prime-budget.manager";
import type { Transition } from "../../application/lifecycle/lifecycle.manager";

/**
 * The signals, on disk. Append-only, always.
 *
 * A published signal is a matter of record the instant it exists. It is never
 * deleted and its trade parameters are never edited — only its `status` advances,
 * and every advance is appended to `SignalTransition` so the whole life is
 * reconstructable in order. A track record you can quietly revise is not a track
 * record; it is marketing with a database behind it (06-STRATEGIES §5).
 */
@Injectable()
export class SignalRepository {
  private readonly logger = new Logger(SignalRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a newly published signal.
   *
   * Idempotent on the deterministic id: re-publishing the same opportunity (a
   * pipeline re-run, a reconnect) is a no-op rather than a duplicate row. This is
   * the last line of the deduplication defence, enforced by the database itself.
   */
  async publish(signal: PublishedSignal): Promise<{ created: boolean }> {
    const existing = await this.prisma.signal.findUnique({ where: { id: signal.id } });
    if (existing) {
      this.logger.debug(`${signal.id} already published — idempotent no-op`);
      return { created: false };
    }

    await this.prisma.$transaction([
      this.prisma.signal.create({ data: toRow(signal) }),
      this.prisma.signalTransition.create({
        data: {
          signalId: signal.id,
          from: signal.status,
          to: signal.status,
          reason: "published",
          at: BigInt(signal.publishedAt),
        },
      }),
    ]);

    return { created: true };
  }

  async byId(id: string): Promise<PublishedSignal | null> {
    const row = await this.prisma.signal.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }

  /** Recently published signals — the dedup set and the "active feed". */
  async recent(input: {
    since: number;
    statuses?: SignalStatus[];
    limit?: number;
  }): Promise<PublishedSignal[]> {
    const rows = await this.prisma.signal.findMany({
      where: {
        publishedAt: { gte: BigInt(input.since) },
        ...(input.statuses ? { status: { in: input.statuses } } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: input.limit ?? 200,
    });

    return rows.map(fromRow);
  }

  /** Advance a signal's lifecycle and append the transition. Never overwrites history. */
  async applyTransition(signalId: string, t: Transition): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.signal.update({
        where: { id: signalId },
        data: { status: t.to },
      }),
      this.prisma.signalTransition.create({
        data: {
          signalId,
          from: t.from,
          to: t.to,
          reason: t.reason,
          at: BigInt(t.at),
        },
      }),
    ]);
  }

  async history(signalId: string): Promise<Transition[]> {
    const rows = await this.prisma.signalTransition.findMany({
      where: { signalId },
      orderBy: { at: "asc" },
    });

    return rows.map((r) => ({
      from: r.from as SignalStatus,
      to: r.to as SignalStatus,
      reason: r.reason,
      at: Number(r.at),
    }));
  }

  /* ── The Prime budget ledger ───────────────────────────────────── */

  /** Award a Prime slot. The unique keys make double-spending a slot impossible. */
  async awardPrime(input: {
    day: string;
    slot: number;
    signalId: string;
    symbol: string;
    score: number;
    awardedAt: number;
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.primeAllocation.create({
        data: {
          day: input.day,
          slot: input.slot,
          signalId: input.signalId,
          symbol: input.symbol,
          score: input.score,
          awardedAt: BigInt(input.awardedAt),
        },
      }),
      this.prisma.signal.update({
        where: { id: input.signalId },
        data: { isPrime: true },
      }),
    ]);
  }

  /**
   * Reconstruct today's budget from the ledger — the source of truth for the caps.
   *
   * Built from the rows rather than an in-memory counter so it survives a restart:
   * the day's Prime allocations are a durable fact, and a process that forgot them
   * on reboot could blow the budget every deploy.
   */
  async budgetLedger(day: string, total: number, hourStart: number): Promise<BudgetLedger> {
    const allocations = await this.prisma.primeAllocation.findMany({ where: { day } });

    const perSymbol = new Map<string, number>();
    let thisHour = 0;

    for (const a of allocations) {
      perSymbol.set(a.symbol, (perSymbol.get(a.symbol) ?? 0) + 1);
      if (Number(a.awardedAt) >= hourStart) thisHour += 1;
    }

    /* Per-strategy needs the signals behind the allocations. */
    const perStrategy = new Map<string, number>();
    if (allocations.length > 0) {
      const signals = await this.prisma.signal.findMany({
        where: { id: { in: allocations.map((a) => a.signalId) } },
        select: { strategies: true },
      });
      for (const s of signals) {
        for (const strategy of s.strategies) {
          perStrategy.set(strategy, (perStrategy.get(strategy) ?? 0) + 1);
        }
      }
    }

    return {
      total,
      awarded: allocations.length,
      perSymbol,
      perStrategy,
      thisHour,
    };
  }

  async countByStatus(): Promise<Record<string, number>> {
    const grouped = await this.prisma.signal.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  }
}

/* ── Row mapping ───────────────────────────────────────────────────── */

function toRow(s: PublishedSignal) {
  return {
    id: s.id,
    symbol: s.symbol,
    exchange: s.exchange,
    timeframe: s.timeframe,
    direction: s.direction,
    regime: s.regime,
    strategies: [...s.strategies],
    rulesHashes: [...s.rulesHashes],
    marketType: s.marketType,
    suggestedLeverage: s.suggestedLeverage,
    entryPrice: s.entryPrice,
    stopLoss: s.stopLoss,
    takeProfits: [...s.takeProfits],
    confidence: s.confidence as object,
    confluence: s.confluence as object,
    signalScore: s.signalScore as object,
    isPrime: s.isPrime,
    status: s.status,
    barTime: BigInt(s.barTime),
    publishedAt: BigInt(s.publishedAt),
    expiresAt: BigInt(s.expiresAt),
    summary: s.summary,
    whyPublished: s.whyPublished,
    supporting: [...s.supporting],
    contradicting: [...s.contradicting],
    unassessed: [...s.unassessed],
    calibrationVersion: s.calibrationVersion,
  };
}

function fromRow(row: Record<string, unknown>): PublishedSignal {
  return publishedSignalSchema.parse({
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange,
    timeframe: row.timeframe,
    direction: row.direction,
    regime: row.regime,
    strategies: row.strategies,
    rulesHashes: row.rulesHashes,
    marketType: row.marketType,
    suggestedLeverage: row.suggestedLeverage,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfits: row.takeProfits,
    confidence: row.confidence,
    confluence: row.confluence,
    signalScore: row.signalScore,
    isPrime: row.isPrime,
    status: row.status,
    barTime: Number(row.barTime),
    publishedAt: Number(row.publishedAt),
    expiresAt: Number(row.expiresAt),
    summary: row.summary,
    whyPublished: row.whyPublished,
    supporting: row.supporting,
    contradicting: row.contradicting,
    unassessed: row.unassessed,
    calibrationVersion: row.calibrationVersion,
  });
}
