export type HealthStatus = "healthy" | "warning" | "critical" | "offline";
export type LogSeverity = "info" | "warning" | "error" | "critical" | "debug";

export interface PlatformHealth {
  apiStatus: HealthStatus;
  database: HealthStatus;
  redis: HealthStatus;
  bullMq: HealthStatus;
  marketScanner: HealthStatus;
  websocketServer: HealthStatus;
  exchangeConnections: HealthStatus;
  notificationServices: HealthStatus;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended" | "pending";
  lastLogin: number;
  twoFactorEnabled: boolean;
  createdAt: number;
}

export interface Role {
  id: string;
  name: string;
  users: number;
  permissions: string[];
}

export interface AdminStrategy {
  id: string;
  name: string;
  version: string;
  status: "running" | "stopped" | "error";
  health: HealthStatus;
  signalsToday: number;
  winRate: number;
  enabled: boolean;
}

export interface AdminExchange {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "degraded";
  latencyMs: number;
  marketCount: number;
  lastSync: number;
  health: HealthStatus;
}

export interface QueueStatus {
  id: string;
  name: string;
  waiting: number;
  processing: number;
  completed: number;
  failed: number;
  retries: number;
}

export interface WorkerNode {
  id: string;
  name: string;
  status: "active" | "idle" | "offline";
  cpuUsage: number;
  memoryUsageBytes: number;
  tasksProcessed: number;
  uptimeSeconds: number;
  health: HealthStatus;
}

export interface ServiceProvider {
  id: string;
  name: string;
  type: "ai" | "notification";
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
  usageCount: number;
  quotaMax: number | null;
}

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  environment: "production" | "staging" | "development";
  rolloutPercentage: number;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  module: string;
  timestamp: number;
  ipAddress: string;
  status: "success" | "failure";
}

export interface SystemLog {
  id: string;
  timestamp: number;
  severity: LogSeverity;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface MonitoringDataPoint {
  /** Unix seconds. */
  time: number;
  value: number;
}

/** Resource utilisation series rendered by the monitoring charts. */
export interface AdminMonitoring {
  cpu: MonitoringDataPoint[];
  memory: MonitoringDataPoint[];
  network: MonitoringDataPoint[];
}

export interface AdminDashboardMetrics {
  activeUsers: number;
  signalsToday: number;
  runningStrategies: number;
  onlineExchanges: number;
  apiHealthScore: number;
  systemUptimeSeconds: number;
  memoryUsagePct: number;
  cpuUsagePct: number;
  diskUsagePct: number;
  notificationSuccessRate: number;
}
