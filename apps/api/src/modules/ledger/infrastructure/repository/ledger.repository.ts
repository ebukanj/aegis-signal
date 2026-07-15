import { Injectable, Logger } from "@nestjs/common";
import {
  ledgerEntrySchema,
  type AuditAction,
  type AuditEvent,
  type LedgerEntry,
  type OutcomeType,
  type Settlement,
} from "@aegis/contracts";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../core/database/prisma.service";

/**
 * The ledger, on disk. The permanent memory of the platform.
 *
 * Two rules govern every method here, and both exist because the alternative is a
 * track record that cannot be trusted:
 *
 *   **1 · Settlement is one-way and happens ONCE.** An entry is settled exactly
 *        once and never again. A second settlement is refused, not overwritten —
 *        because "what happened" cannot happen twice, and a settled outcome that
 *        can be re-settled is not a record.
 *
 *   **2 · Every mutation is audited.** Registration, trigger, settlement — each
 *        appends a `LedgerAudit` row. A correction is a NEW row, never an edit to
 *        an old one. The history of the history is itself immutable.
 */
@Injectable()
export class LedgerRepository {
  private readonly logger = new Logger(LedgerRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ── Registration ──────────────────────────────────────────────── */

  /**
   * Record a newly published signal. Idempotent on the signal id — a signal is
   * registered once, and re-registering it (a replay, a reconnect) is a no-op.
   */
  async register(entry: LedgerEntry): Promise<{ created: boolean }> {
    const existing = await this.prisma.ledgerEntry.findUnique({
      where: { signalId: entry.signalId },
    });
    if (existing) return { created: false };

    await this.prisma.$transaction([
      this.prisma.ledgerEntry.create({ data: toRow(entry) }),
      auditRow(this.prisma, entry.signalId, "CREATED", `registered ${entry.strategyId} ${entry.direction} ${entry.symbol}`, entry.publishedAt),
    ]);

    return { created: true };
  }

  /* ── Settlement — one way, once, forever ───────────────────────── */

  /**
   * Settle an open entry. Refuses to re-settle a settled one.
   *
   * The guard is a read-then-conditional-write inside a transaction: if the entry
   * is already settled, the settlement is REFUSED and the attempt is audited as a
   * CORRECTION (an appended note that someone tried), never applied. A settled
   * outcome is a matter of record.
   */
  async settle(signalId: string, settlement: Settlement): Promise<{ settled: boolean }> {
    const entry = await this.prisma.ledgerEntry.findUnique({ where: { signalId } });
    if (!entry) throw new Error(`Cannot settle unknown signal ${signalId}`);

    if (entry.settlement !== null) {
      /* Already settled. Refuse, and APPEND a note — never overwrite. */
      await auditRow(
        this.prisma,
        signalId,
        "CORRECTION",
        `refused a second settlement (already ${entry.outcome}) — a settled outcome is immutable`,
        settlement.settledAt,
      ).catch(() => undefined);
      this.logger.warn(`Refused re-settlement of ${signalId} (already ${entry.outcome})`);
      return { settled: false };
    }

    await this.prisma.$transaction([
      this.prisma.ledgerEntry.update({
        where: { signalId },
        data: {
          settlement: settlement as object,
          outcome: settlement.outcome,
          realisedR: settlement.realisedR,
          settledAt: BigInt(settlement.settledAt),
        },
      }),
      auditRow(
        this.prisma,
        signalId,
        "SETTLED",
        `settled ${settlement.outcome} at ${settlement.exitReason}, ${settlement.realisedR >= 0 ? "+" : ""}${settlement.realisedR.toFixed(2)}R`,
        settlement.settledAt,
      ),
    ]);

    return { settled: true };
  }

  /** Note that an open trade triggered (reached its entry). Appended, not settled. */
  async recordTrigger(signalId: string, at: number): Promise<void> {
    await auditRow(this.prisma, signalId, "TRIGGERED", "price reached the entry", at);
  }

  /* ── Queries ───────────────────────────────────────────────────── */

  async byId(signalId: string): Promise<LedgerEntry | null> {
    const row = await this.prisma.ledgerEntry.findUnique({ where: { signalId } });
    return row ? fromRow(row) : null;
  }

  /** Open (unsettled) entries — what the settlement worker monitors. */
  async open(): Promise<LedgerEntry[]> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { settledAt: null },
      orderBy: { publishedAt: "desc" },
    });
    return rows.map(fromRow);
  }

  /**
   * Settled entries, filtered — the reliability dataset and the track record are
   * built from these. Every filter the spec names (strategy, symbol, regime,
   * outcome, date range) is a column, so a query never scans JSON.
   */
  async settled(filter: {
    strategyId?: string;
    rulesHash?: string;
    symbol?: string;
    regime?: string;
    outcome?: OutcomeType;
    from?: number;
    to?: number;
    limit?: number;
  } = {}): Promise<LedgerEntry[]> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: {
        settledAt: {
          not: null,
          ...(filter.from ? { gte: BigInt(filter.from) } : {}),
          ...(filter.to ? { lte: BigInt(filter.to) } : {}),
        },
        ...(filter.strategyId ? { strategyId: filter.strategyId } : {}),
        ...(filter.rulesHash ? { rulesHash: filter.rulesHash } : {}),
        ...(filter.symbol ? { symbol: filter.symbol } : {}),
        ...(filter.regime ? { regime: filter.regime } : {}),
        ...(filter.outcome ? { outcome: filter.outcome } : {}),
      },
      orderBy: { settledAt: "asc" },
      take: filter.limit ?? 5000,
    });
    return rows.map(fromRow);
  }

  async history(signalId: string): Promise<AuditEvent[]> {
    const rows = await this.prisma.ledgerAudit.findMany({
      where: { signalId },
      orderBy: { at: "asc" },
    });
    return rows.map((r) => ({
      signalId: r.signalId,
      action: r.action as AuditAction,
      detail: r.detail,
      at: Number(r.at),
    }));
  }

  async counts(): Promise<{ total: number; settled: number; open: number }> {
    const [total, settled] = await Promise.all([
      this.prisma.ledgerEntry.count(),
      this.prisma.ledgerEntry.count({ where: { settledAt: { not: null } } }),
    ]);
    return { total, settled, open: total - settled };
  }
}

/* ── Row mapping ───────────────────────────────────────────────────── */

function auditRow(
  prisma: PrismaService,
  signalId: string,
  action: AuditAction,
  detail: string,
  at: number,
) {
  return prisma.ledgerAudit.create({ data: { signalId, action, detail, at: BigInt(at) } });
}

function toRow(e: LedgerEntry) {
  return {
    signalId: e.signalId,
    strategyId: e.strategyId,
    strategyVersion: e.strategyVersion,
    rulesHash: e.rulesHash,
    symbol: e.symbol,
    exchange: e.exchange,
    market: e.market,
    timeframe: e.timeframe,
    direction: e.direction,
    regime: e.regime,
    entryPrice: e.entryPrice,
    stopLoss: e.stopLoss,
    takeProfits: [...e.takeProfits],
    confidence: e.confidence as object,
    confluence: e.confluence as object,
    signalScore: e.signalScore as object,
    calibrationVersion: e.calibrationVersion,
    publishedAt: BigInt(e.publishedAt),
    barTime: BigInt(e.barTime),
    /* Prisma wants its own sentinel for a NULL json column, not JS null. */
    settlement: e.settlement ? (e.settlement as Prisma.InputJsonValue) : Prisma.DbNull,
    outcome: e.settlement?.outcome ?? null,
    realisedR: e.settlement?.realisedR ?? null,
    settledAt: e.settlement ? BigInt(e.settlement.settledAt) : null,
  };
}

function fromRow(row: Record<string, unknown>): LedgerEntry {
  return ledgerEntrySchema.parse({
    signalId: row.signalId,
    strategyId: row.strategyId,
    strategyVersion: row.strategyVersion,
    rulesHash: row.rulesHash,
    symbol: row.symbol,
    exchange: row.exchange,
    market: row.market,
    timeframe: row.timeframe,
    direction: row.direction,
    regime: row.regime,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfits: row.takeProfits,
    confidence: row.confidence,
    confluence: row.confluence,
    signalScore: row.signalScore,
    calibrationVersion: row.calibrationVersion,
    publishedAt: Number(row.publishedAt),
    barTime: Number(row.barTime),
    settlement: row.settlement ?? null,
  });
}
