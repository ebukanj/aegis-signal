import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../../core/database/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  /** 0–100. A request is "in" if a stable hash of its key falls under this. */
  rolloutPercent: number;
  description: string;
}

/**
 * Runtime feature flags — turn behaviour on and off WITHOUT a deployment.
 *
 * The point of a flag is speed under pressure: a strategy misbehaves at 2am, an
 * exchange integration starts failing, a new path needs to be dark for everyone but
 * a canary. A deploy takes minutes and a review; a flag takes a request. So flags
 * live in the database, are read from a hot in-memory cache, and every change is
 * AUDITED — because a switch that can silently change the platform's behaviour is
 * exactly the switch whose history you most need.
 *
 * ── The kill switch ──
 *
 * `disable` is the emergency stop. It is a flag like any other, but it is the one an
 * operator reaches for when something is actively wrong, and it takes effect on the
 * next request everywhere. No flag change requires a restart; that is the whole
 * value.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cache = new Map<string, FeatureFlag>();

  /** The known flags and their defaults. A flag absent from the DB reads its default. */
  private static readonly DEFAULTS: FeatureFlag[] = [
    { key: "signals.publish", enabled: true, rolloutPercent: 100, description: "Publish new signals" },
    { key: "notifications.deliver", enabled: true, rolloutPercent: 100, description: "Deliver notifications" },
    { key: "insights.collect", enabled: true, rolloutPercent: 100, description: "Collect news insights" },
    { key: "ledger.settle", enabled: true, rolloutPercent: 100, description: "Settle open signals" },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const flag of FeatureFlagsService.DEFAULTS) this.cache.set(flag.key, flag);
    await this.reload();
  }

  /** Is a flag on? The hot path — reads memory, never the database. */
  isEnabled(key: string, subjectKey?: string): boolean {
    const flag = this.cache.get(key);
    if (!flag) return false; // an unknown flag is OFF — fail closed
    if (!flag.enabled) return false;
    if (flag.rolloutPercent >= 100) return true;
    if (flag.rolloutPercent <= 0) return false;
    /* Stable, deterministic bucketing: the same subject always lands the same side
     * of the rollout, so a percentage rollout is consistent rather than a coin flip
     * per request. */
    return bucket(subjectKey ?? key) < flag.rolloutPercent;
  }

  all(): FeatureFlag[] {
    return [...this.cache.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Flip a flag at runtime, persisted and audited. */
  async set(
    key: string,
    change: Partial<Pick<FeatureFlag, "enabled" | "rolloutPercent">>,
    actor: string,
  ): Promise<FeatureFlag> {
    const current = this.cache.get(key) ?? {
      key,
      enabled: false,
      rolloutPercent: 0,
      description: "custom flag",
    };
    const next: FeatureFlag = {
      ...current,
      ...(change.enabled !== undefined ? { enabled: change.enabled } : {}),
      ...(change.rolloutPercent !== undefined ? { rolloutPercent: clamp(change.rolloutPercent) } : {}),
    };

    await this.prisma.adminSetting.upsert({
      where: { key: settingKey(key) },
      create: { key: settingKey(key), value: next as object, updatedBy: actor },
      update: { value: next as object, updatedBy: actor },
    });
    this.cache.set(key, next);

    await this.audit.record({
      action: "feature-flag.set",
      actor,
      detail: `${key}: ${current.enabled ? "on" : "off"}/${current.rolloutPercent}% → ${next.enabled ? "on" : "off"}/${next.rolloutPercent}%`,
      metadata: { key, before: current, after: next },
      at: Date.now(),
    });

    this.logger.log(`Feature flag ${key} set to ${next.enabled ? "ON" : "OFF"} (${next.rolloutPercent}%) by ${actor}`);
    return next;
  }

  private async reload(): Promise<void> {
    const rows = await this.prisma.adminSetting.findMany({
      where: { key: { startsWith: "flag:" } },
    });
    for (const row of rows) {
      const flag = row.value as unknown as FeatureFlag;
      this.cache.set(flag.key, flag);
    }
  }
}

function settingKey(key: string): string {
  return `flag:${key}`;
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
/** FNV-1a of the subject → 0–99, stable across processes. */
function bucket(subject: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < subject.length; i += 1) {
    hash ^= subject.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}
