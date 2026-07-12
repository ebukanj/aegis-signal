import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import type { 
  PlatformHealth, AdminUser, Role, AdminStrategy, AdminExchange, 
  QueueStatus, WorkerNode, ServiceProvider, FeatureFlag, 
  AuditLog, SystemLog, MonitoringDataPoint, AdminDashboardMetrics 
} from "../types";

export function generateMockAdminData() {
  const rand = createSeededRandom(9876);
  const now = Math.floor(Date.now() / 1000);
  const randomFloat = (min: number, max: number) => min + rand() * (max - min);
  const randomChoice = <T>(items: T[] | readonly T[]) => pick(rand, items);

  const health: PlatformHealth = {
    apiStatus: "healthy",
    database: "healthy",
    redis: "healthy",
    bullMq: "warning",
    marketScanner: "healthy",
    websocketServer: "healthy",
    exchangeConnections: "warning",
    notificationServices: "healthy",
    aiServices: "healthy",
    storage: "healthy",
  };

  const dashboard: AdminDashboardMetrics = {
    activeUsers: 1243,
    signalsToday: 892,
    runningStrategies: 14,
    onlineExchanges: 5,
    apiHealthScore: 98,
    systemUptimeSeconds: 1209600, // 14 days
    memoryUsagePct: 68,
    cpuUsagePct: 42,
    diskUsagePct: 31,
    notificationSuccessRate: 99.8,
  };

  const users: AdminUser[] = Array.from({ length: 50 }).map((_, i) => ({
    id: `usr_${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    role: randomChoice(["Trader", "Trader", "Trader", "Analyst", "Administrator", "Viewer"]),
    status: randomChoice(["active", "active", "active", "suspended", "pending"]),
    lastLogin: now - randInt(rand, 60, 86400 * 7),
    twoFactorEnabled: rand() > 0.3,
    createdAt: now - randInt(rand, 86400 * 30, 86400 * 365),
  }));

  const roles: Role[] = [
    { id: "rl_1", name: "Super Admin", users: 2, permissions: ["*"] },
    { id: "rl_2", name: "Administrator", users: 5, permissions: ["users:read", "users:write", "settings:write"] },
    { id: "rl_3", name: "Analyst", users: 12, permissions: ["strategies:read", "signals:read", "analytics:read"] },
    { id: "rl_4", name: "Trader", users: 1200, permissions: ["trade:execute", "portfolio:read"] },
    { id: "rl_5", name: "Viewer", users: 45, permissions: ["dashboard:read"] },
  ];

  const strategies: AdminStrategy[] = [
    { id: "str_1", name: "Momentum Ignition", version: "v2.1.0", status: "running", health: "healthy", signalsToday: 145, winRate: 62.4, enabled: true },
    { id: "str_2", name: "Statistical Arbitrage", version: "v1.8.4", status: "running", health: "healthy", signalsToday: 890, winRate: 51.2, enabled: true },
    { id: "str_3", name: "Mean Reversion Lite", version: "v1.0.1", status: "stopped", health: "offline", signalsToday: 0, winRate: 0, enabled: false },
    { id: "str_4", name: "Orderbook Imbalance", version: "v3.0.0-beta", status: "error", health: "critical", signalsToday: 12, winRate: 45.0, enabled: true },
  ];

  const exchanges: AdminExchange[] = [
    { id: "ex_1", name: "Binance", status: "connected", latencyMs: 45, marketCount: 1204, lastSync: now - 5, health: "healthy" },
    { id: "ex_2", name: "Bybit", status: "connected", latencyMs: 62, marketCount: 450, lastSync: now - 12, health: "healthy" },
    { id: "ex_3", name: "OKX", status: "degraded", latencyMs: 450, marketCount: 612, lastSync: now - 120, health: "warning" },
    { id: "ex_4", name: "Kraken", status: "disconnected", latencyMs: 0, marketCount: 0, lastSync: now - 86400, health: "offline" },
  ];

  const queues: QueueStatus[] = [
    { id: "q_1", name: "Market Data", waiting: 12, processing: 4, completed: 145000, failed: 23, retries: 5 },
    { id: "q_2", name: "Strategy Engine", waiting: 0, processing: 2, completed: 89000, failed: 0, retries: 0 },
    { id: "q_3", name: "Risk Validation", waiting: 45, processing: 10, completed: 12000, failed: 150, retries: 45 },
    { id: "q_4", name: "Notifications", waiting: 120, processing: 50, completed: 450000, failed: 1200, retries: 300 },
  ];

  const workers: WorkerNode[] = [
    { id: "wk_1", name: "market-worker-01", status: "active", cpuUsage: 45, memoryUsageBytes: 1024 * 1024 * 512, tasksProcessed: 145000, uptimeSeconds: 86400 * 5, health: "healthy" },
    { id: "wk_2", name: "market-worker-02", status: "active", cpuUsage: 48, memoryUsageBytes: 1024 * 1024 * 520, tasksProcessed: 142000, uptimeSeconds: 86400 * 5, health: "healthy" },
    { id: "wk_3", name: "strategy-worker-01", status: "active", cpuUsage: 85, memoryUsageBytes: 1024 * 1024 * 1024, tasksProcessed: 89000, uptimeSeconds: 86400 * 2, health: "warning" },
    { id: "wk_4", name: "notification-worker-01", status: "offline", cpuUsage: 0, memoryUsageBytes: 0, tasksProcessed: 450000, uptimeSeconds: 0, health: "critical" },
  ];

  const services: ServiceProvider[] = [
    { id: "svc_1", name: "Claude 3.5 Sonnet", type: "ai", status: "healthy", latencyMs: 850, usageCount: 45000, quotaMax: 1000000 },
    { id: "svc_2", name: "OpenAI GPT-4o", type: "ai", status: "degraded", latencyMs: 2400, usageCount: 12000, quotaMax: 500000 },
    { id: "svc_3", name: "Telegram API", type: "notification", status: "healthy", latencyMs: 120, usageCount: 850000, quotaMax: null },
    { id: "svc_4", name: "SendGrid", type: "notification", status: "healthy", latencyMs: 250, usageCount: 45000, quotaMax: 100000 },
  ];

  const featureFlags: FeatureFlag[] = [
    { id: "ff_1", name: "new-dashboard-ui", description: "Enable the new React 19 dashboard layout.", enabled: true, environment: "production", rolloutPercentage: 100, createdAt: now - 86400 * 30 },
    { id: "ff_2", name: "ai-trade-explanations", description: "Use Claude to explain signal rationale.", enabled: true, environment: "production", rolloutPercentage: 25, createdAt: now - 86400 * 5 },
    { id: "ff_3", name: "solana-dex-integration", description: "Enable Raydium and Orca scanners.", enabled: false, environment: "staging", rolloutPercentage: 0, createdAt: now - 86400 * 2 },
  ];

  const auditLogs: AuditLog[] = Array.from({ length: 100 }).map((_, i) => ({
    id: `al_${i}`,
    user: `admin@aegis-signal.io`,
    action: randomChoice(["UPDATE_ROLE", "SUSPEND_USER", "RESTART_WORKER", "DISABLE_STRATEGY", "UPDATE_CONFIG"]),
    module: randomChoice(["Users", "Workers", "Strategies", "System"]),
    timestamp: now - i * randInt(rand, 300, 3600),
    ipAddress: "192.168.1.42",
    status: rand() > 0.1 ? "success" : "failure",
  }));

  const systemLogs: SystemLog[] = Array.from({ length: 100 }).map((_, i) => ({
    id: `sl_${i}`,
    timestamp: now - i * randInt(rand, 10, 60),
    severity: randomChoice(["info", "info", "info", "warning", "error", "debug"]),
    module: randomChoice(["MarketScanner", "RiskEngine", "BullMQ", "Database"]),
    message: randomChoice([
      "Successfully synced 1204 markets from Binance.",
      "Worker memory usage exceeded 80% threshold.",
      "Failed to connect to Redis instance.",
      "Processed 45 signals in the last minute.",
      "Connection timeout on OKX WebSocket.",
    ]),
  }));

  // Generate 60 points of mock monitoring data (e.g. 1 hour, 1 point per minute)
  const generateSeries = (base: number, volatility: number) => {
    const series: MonitoringDataPoint[] = [];
    let current = base;
    for (let i = 60; i >= 0; i--) {
      current = Math.max(0, Math.min(100, current + randomFloat(-volatility, volatility)));
      series.push({ time: now - i * 60, value: Math.round(current) });
    }
    return series;
  };

  const monitoring = {
    cpu: generateSeries(40, 5),
    memory: generateSeries(65, 2),
    network: generateSeries(50, 15),
  };

  return {
    health,
    dashboard,
    users,
    roles,
    strategies,
    exchanges,
    queues,
    workers,
    services,
    featureFlags,
    auditLogs,
    systemLogs,
    monitoring,
  };
}

export const mockAdminData = generateMockAdminData();
