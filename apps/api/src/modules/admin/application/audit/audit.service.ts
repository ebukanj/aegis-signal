import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../core/database/prisma.service";

export interface AuditEntry {
  action: string;
  actor: string;
  detail: string;
  metadata?: Record<string, unknown>;
  at: number;
}

/**
 * The record of who did what, when — and it cannot be rewritten.
 *
 * Every administrative action passes through here: a feature flag flipped,
 * maintenance mode declared, an operator disabling a strategy. It is APPEND-ONLY.
 * There is no update, no delete, no "fix the audit log" — a correction is a new
 * row. An audit trail an administrator can edit is not an audit trail; it is a
 * story the administrator gets to tell, and in a system that manages money the
 * difference is the whole point.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.adminAudit.create({
      data: {
        action: entry.action,
        actor: entry.actor,
        detail: entry.detail,
        metadata: (entry.metadata as object) ?? undefined,
        at: BigInt(entry.at),
      },
    });
  }

  async recent(limit = 100): Promise<(AuditEntry & { id: string })[]> {
    const rows = await this.prisma.adminAudit.findMany({
      orderBy: { at: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      detail: r.detail,
      metadata: (r.metadata as Record<string, unknown>) ?? undefined,
      at: Number(r.at),
    }));
  }
}
