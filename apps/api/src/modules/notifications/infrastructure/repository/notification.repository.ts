import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  notificationSchema,
  type DeliveryStatus,
  type Notification,
  type NotificationChannel,
} from "@aegis/contracts";
import { PrismaService } from "../../../../core/database/prisma.service";

/**
 * Deliveries, on disk — the observability the engine promises.
 *
 * The store is keyed by the DETERMINISTIC delivery id, which is how "exactly once"
 * is enforced at the database boundary: creating a delivery that already exists is
 * refused, so a re-processed event — a retried job, a restarted worker replaying
 * the queue — cannot send the same notification twice. Every status change is
 * written through here, so a delivery's whole lifecycle is a matter of record.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a delivery, or report it already exists (idempotent — exactly once). */
  async create(notification: Notification): Promise<{ created: boolean }> {
    const existing = await this.prisma.notification.findUnique({ where: { id: notification.id } });
    if (existing) return { created: false };

    await this.prisma.notification.create({ data: toRow(notification) });
    return { created: true };
  }

  async updateStatus(
    id: string,
    status: DeliveryStatus,
    patch: { attempts?: number; providerResponse?: string | null; deliveredAt?: number | null } = {},
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: {
        status,
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.providerResponse !== undefined ? { providerResponse: patch.providerResponse } : {}),
        ...(patch.deliveredAt !== undefined
          ? { deliveredAt: patch.deliveredAt === null ? null : BigInt(patch.deliveredAt) }
          : {}),
      },
    });
  }

  async byId(id: string): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }

  /**
   * Has an equivalent notification already gone out inside the dedup window? Keyed
   * on (recipient, type, subject, channel) within `windowMs`.
   */
  async recentDuplicate(input: {
    recipient: string;
    type: string;
    subject: string | null;
    channel: NotificationChannel;
    since: number;
  }): Promise<boolean> {
    const count = await this.prisma.notification.count({
      where: {
        recipient: input.recipient,
        type: input.type,
        subject: input.subject,
        channel: input.channel,
        createdAt: { gte: BigInt(input.since) },
        status: { notIn: ["CANCELLED", "SUPPRESSED"] },
      },
    });
    return count > 0;
  }

  async recent(limit = 100): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(fromRow);
  }

  async statsSince(since: number): Promise<{
    today: number;
    delivered: number;
    failed: number;
    suppressed: number;
    byChannel: Record<string, { sent: number; failed: number }>;
  }> {
    const rows = await this.prisma.notification.findMany({
      where: { createdAt: { gte: BigInt(since) } },
      select: { status: true, channel: true },
    });

    const byChannel: Record<string, { sent: number; failed: number }> = {};
    let delivered = 0;
    let failed = 0;
    let suppressed = 0;

    for (const r of rows) {
      byChannel[r.channel] ??= { sent: 0, failed: 0 };
      if (r.status === "DELIVERED") { delivered += 1; byChannel[r.channel].sent += 1; }
      else if (r.status === "FAILED") { failed += 1; byChannel[r.channel].failed += 1; }
      else if (r.status === "SUPPRESSED") suppressed += 1;
    }

    return { today: rows.length, delivered, failed, suppressed, byChannel };
  }
}

function toRow(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    priority: n.priority,
    channel: n.channel,
    recipient: n.recipient,
    subject: n.subject,
    message: n.message as unknown as Prisma.InputJsonValue,
    status: n.status,
    attempts: n.attempts,
    providerResponse: n.providerResponse,
    createdAt: BigInt(n.createdAt),
    scheduledFor: BigInt(n.scheduledFor),
    deliveredAt: n.deliveredAt === null ? null : BigInt(n.deliveredAt),
  };
}

function fromRow(row: Record<string, unknown>): Notification {
  return notificationSchema.parse({
    id: row.id,
    type: row.type,
    priority: row.priority,
    channel: row.channel,
    recipient: row.recipient,
    subject: row.subject,
    message: row.message,
    status: row.status,
    attempts: row.attempts,
    providerResponse: row.providerResponse,
    createdAt: Number(row.createdAt),
    scheduledFor: Number(row.scheduledFor),
    deliveredAt: row.deliveredAt === null ? null : Number(row.deliveredAt),
  });
}
