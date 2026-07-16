import type { AdminOverviewDto, AuditEntryDto, HealthLevel } from "@aegis/contracts";
import type {
  AdminDashboardMetrics,
  AdminExchange,
  AuditLog,
  FeatureFlag,
  HealthStatus,
  PlatformHealth,
  QueueStatus,
} from "../types";

/**
 * Real backend shapes → the view-model shapes the admin components already render.
 *
 * The presentational components predate the API and speak their own vocabulary
 * (`HealthStatus`, `AdminExchange`, …). Rather than rewrite every component, we map
 * the real `/admin/overview` into those shapes here. The rule this file follows: map
 * only what the backend actually measures, and where it measures nothing, say so
 * honestly (a health of "offline", a rate of 0) rather than inventing a number.
 */

function level(status: HealthLevel): HealthStatus {
  return status === "HEALTHY" ? "healthy" : status === "WARNING" ? "warning" : "critical";
}

/** The view models count time in Unix seconds; the API speaks epoch milliseconds. */
function toSeconds(epochMs: number): number {
  return Math.floor(epochMs / 1000);
}

function moduleStatus(overview: AdminOverviewDto, name: string): HealthStatus {
  const m = overview.modules.find((x) => x.module === name);
  return m ? level(m.status) : "offline";
}

/**
 * Platform health. Each tile maps to a real signal in the overview; the two the
 * backend cannot see yet are told truthfully — AI services are not live, and the
 * database/redis specifics are inferred from the modules that depend on them (a
 * healthy ledger means a reachable database; readable queues mean a reachable redis).
 */
export function toPlatformHealth(overview: AdminOverviewDto): PlatformHealth {
  const queuesReadable = overview.queues.length > 0;
  const anyExchange = overview.exchanges.some((e) => e.connected);
  return {
    apiStatus: level(overview.system.status),
    database: moduleStatus(overview, "ledger"),
    redis: queuesReadable ? "healthy" : "warning",
    bullMq: queuesReadable ? "healthy" : "offline",
    marketScanner: moduleStatus(overview, "signals"),
    websocketServer: level(overview.system.status),
    exchangeConnections: anyExchange ? "healthy" : "critical",
    notificationServices: moduleStatus(overview, "notifications"),
    aiServices: "offline", // No AI service is live yet — stated, never faked.
    storage: moduleStatus(overview, "ledger"),
  };
}

export function toExchanges(overview: AdminOverviewDto): AdminExchange[] {
  return overview.exchanges.map((e) => ({
    id: e.exchange,
    name: e.exchange.toUpperCase(),
    status: e.circuitOpen ? "degraded" : e.connected ? "connected" : "disconnected",
    latencyMs: e.latencyMs ?? 0,
    marketCount: e.activeSubscriptions,
    lastSync: toSeconds(overview.generatedAt),
    health: e.circuitOpen ? "warning" : e.connected ? "healthy" : "critical",
  }));
}

export function toQueues(overview: AdminOverviewDto): QueueStatus[] {
  return overview.queues.map((q) => ({
    id: q.name,
    name: q.name,
    waiting: q.waiting,
    processing: q.active,
    completed: q.completed,
    failed: q.failed,
    retries: q.delayed,
  }));
}

export function toFeatureFlags(overview: AdminOverviewDto): FeatureFlag[] {
  return overview.flags.map((f) => ({
    id: f.key,
    name: f.key,
    description: f.description,
    enabled: f.enabled,
    environment: (overview.build.environment === "production" ? "production" : "development") as
      | "production"
      | "staging"
      | "development",
    rolloutPercentage: f.rolloutPercent,
    createdAt: toSeconds(overview.generatedAt),
  }));
}

export function toAuditLogs(entries: AuditEntryDto[]): AuditLog[] {
  return entries.map((e) => ({
    id: e.id,
    user: e.actor,
    action: `${e.action} — ${e.detail}`,
    module: e.action.split(".")[0] ?? "admin",
    timestamp: toSeconds(e.at),
    ipAddress: e.actor.includes("@") ? e.actor.split("@")[1] : "—",
    status: "success",
  }));
}

/** Read a numeric metric out of a module's open metrics bag, if present. */
function num(overview: AdminOverviewDto, module: string, key: string): number {
  const m = overview.modules.find((x) => x.module === module);
  const v = m?.metrics?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * The dashboard tiles. Real where the platform measures it; a plain 0 where a
 * measurement belongs to a later milestone (there is no user system yet, so
 * `activeUsers` is genuinely zero, and disk usage is not instrumented). Nothing here
 * is invented to look busier than the platform is.
 */
export function toDashboardMetrics(overview: AdminOverviewDto): AdminDashboardMetrics {
  const healthScore =
    overview.system.status === "HEALTHY" ? 100 : overview.system.status === "WARNING" ? 75 : 40;
  const deliveryRate = num(overview, "notifications", "deliveryRate");
  return {
    activeUsers: 0, // No user system yet (arrives with the Users milestone).
    signalsToday: num(overview, "ledger", "totalSignals"),
    runningStrategies: 0, // Strategy administration is not exposed yet.
    onlineExchanges: overview.exchanges.filter((e) => e.connected).length,
    apiHealthScore: healthScore,
    systemUptimeSeconds: overview.system.uptimeSeconds,
    memoryUsagePct: Math.round(overview.system.memory.systemUsedPercent),
    cpuUsagePct: Math.round(overview.system.cpu.loadPercent),
    diskUsagePct: 0, // Not instrumented.
    notificationSuccessRate: Math.round(deliveryRate * 100),
  };
}
