import { z } from "zod";
import { epochMsSchema } from "./common/value-objects";

/**
 * The Administration & Observability surface.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT OBSERVES AND OPERATES. IT DECIDES NOTHING ABOUT TRADING.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Admin sees the whole platform at once — every module's health, the queues, the
 * exchanges, the flags an operator can flip — and it can turn parts of the platform
 * on and off. What it must never do is reach into the pipeline and change a signal, a
 * score, or a risk decision. Its levers are coarse and honest: a kill switch, a
 * rollout percentage, a maintenance banner. Everything it changes, it audits.
 */

export const healthLevelSchema = z.enum(["HEALTHY", "WARNING", "CRITICAL"]);
export type HealthLevel = z.infer<typeof healthLevelSchema>;

/** One named check inside the system-health rollup (memory, event-loop, cpu, clock). */
export const systemCheckSchema = z.object({
  name: z.string(),
  status: healthLevelSchema,
  detail: z.string(),
});

export const systemHealthSchema = z.object({
  status: healthLevelSchema,
  uptimeSeconds: z.number().int().nonnegative(),
  memory: z.object({
    rssMb: z.number(),
    heapUsedMb: z.number(),
    heapTotalMb: z.number(),
    systemUsedPercent: z.number(),
  }),
  cpu: z.object({ count: z.number(), load1: z.number(), loadPercent: z.number() }),
  eventLoop: z.object({ meanLagMs: z.number(), p99LagMs: z.number() }),
  clock: z.object({ timezone: z.string(), isUtc: z.boolean() }),
  checks: z.array(systemCheckSchema),
});
export type SystemHealthDto = z.infer<typeof systemHealthSchema>;

/** A background queue's depth, at a glance. */
export const queueStatusSchema = z.object({
  name: z.string(),
  waiting: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  paused: z.boolean(),
});
export type QueueStatusDto = z.infer<typeof queueStatusSchema>;

/** A connected exchange's live health. */
export const exchangeStatusSchema = z.object({
  exchange: z.string(),
  connected: z.boolean(),
  latencyMs: z.number().nullable(),
  errorRate: z.number(),
  circuitOpen: z.boolean(),
  activeSubscriptions: z.number().int().nonnegative(),
});
export type ExchangeStatusDto = z.infer<typeof exchangeStatusSchema>;

/** A runtime feature flag as the admin UI sees it. */
export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  rolloutPercent: z.number().min(0).max(100),
  description: z.string(),
});
export type FeatureFlagDto = z.infer<typeof featureFlagSchema>;

export const maintenanceStateSchema = z.object({
  enabled: z.boolean(),
  message: z.string(),
  readOnly: z.boolean(),
  estimatedCompletion: epochMsSchema.nullable(),
  enabledAt: epochMsSchema.nullable(),
});
export type MaintenanceStateDto = z.infer<typeof maintenanceStateSchema>;

/** One immutable audit record. */
export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: z.string(),
  detail: z.string(),
  at: epochMsSchema,
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

/**
 * A single module's summary line: its name, a health level, and whatever metrics it
 * chooses to expose. `metrics` is deliberately open — each module owns the shape of
 * its own numbers, and admin does not pretend to know them.
 */
export const moduleStatusSchema = z.object({
  module: z.string(),
  status: healthLevelSchema,
  note: z.string().nullable(),
  metrics: z.record(z.string(), z.unknown()),
});
export type ModuleStatusDto = z.infer<typeof moduleStatusSchema>;

/** Build & release identity — what is actually running. */
export const buildInfoSchema = z.object({
  service: z.string(),
  version: z.string(),
  commit: z.string(),
  environment: z.string(),
  nodeVersion: z.string(),
  startedAt: epochMsSchema,
});
export type BuildInfoDto = z.infer<typeof buildInfoSchema>;

/** The whole platform, on one screen. */
export const adminOverviewSchema = z.object({
  build: buildInfoSchema,
  system: systemHealthSchema,
  maintenance: maintenanceStateSchema,
  exchanges: z.array(exchangeStatusSchema),
  queues: z.array(queueStatusSchema),
  modules: z.array(moduleStatusSchema),
  flags: z.array(featureFlagSchema),
  generatedAt: epochMsSchema,
});
export type AdminOverviewDto = z.infer<typeof adminOverviewSchema>;
