import { Injectable } from "@nestjs/common";
import type { Prisma, User as PrismaUser, UserRole } from "@prisma/client";

import { PrismaService } from "../../../core/database/prisma.service";

/**
 * The one place user rows are read and written.
 *
 * It returns Prisma rows to the service, which maps them to the contract `User`
 * (never the raw row — the password hash must not leak past this boundary). It
 * owns no rules: whether the first user is an admin, whether a password is
 * strong enough, whether a login is valid — all of that is the service's.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  count(): Promise<number> {
    return this.prisma.user.count();
  }

  findByEmail(email: string): Promise<PrismaUser | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<PrismaUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<PrismaUser> {
    return this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role,
      },
    });
  }

  updatePassword(id: string, passwordHash: string): Promise<PrismaUser> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /* ── Administration ──────────────────────────────────────────────── */

  list(): Promise<PrismaUser[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  }

  setSuspended(id: string, suspended: boolean): Promise<PrismaUser> {
    return this.prisma.user.update({ where: { id }, data: { suspended } });
  }

  /** Hard delete. Preferences cascade; history keeps its author id as a string. */
  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  /* ── Preferences ─────────────────────────────────────────────────── */

  async getPreferences(userId: string): Promise<Prisma.JsonValue | null> {
    const row = await this.prisma.userPreferences.findUnique({ where: { userId } });
    return row?.data ?? null;
  }

  /** Every user's preferences blob — for the watchlist union the scan reads. */
  async allPreferences(): Promise<{ userId: string; data: Prisma.JsonValue }[]> {
    return this.prisma.userPreferences.findMany({ select: { userId: true, data: true } });
  }

  async upsertPreferences(userId: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
  }
}
