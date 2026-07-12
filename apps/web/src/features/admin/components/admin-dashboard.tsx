import { MetricCard } from "@/components/shared/metric-card";
import { Users, Activity, Layers, ArrowRightLeft, HeartPulse, Clock, Cpu, HardDrive, Bell } from "lucide-react";
import type { AdminDashboardMetrics } from "../types";

export function AdminDashboard({ metrics }: { metrics: AdminDashboardMetrics }) {
  const uptimeDays = Math.floor(metrics.systemUptimeSeconds / 86400);

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Platform overview and high-level KPIs.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          label="Active Users (30d)"
          value={metrics.activeUsers.toLocaleString()}
          icon={Users}
          delta="+12%"
          deltaDirection="up"
        />
        <MetricCard
          label="Signals Today"
          value={metrics.signalsToday.toLocaleString()}
          icon={Activity}
          delta="+4.5%"
          deltaDirection="up"
        />
        <MetricCard
          label="Running Strategies"
          value={metrics.runningStrategies.toString()}
          icon={Layers}
          delta="Stable"
          deltaDirection="flat"
        />
        <MetricCard
          label="Online Exchanges"
          value={`${metrics.onlineExchanges} / 6`}
          icon={ArrowRightLeft}
          delta="1 degraded"
          deltaDirection="down"
        />
        
        <MetricCard
          label="API Health Score"
          value={`${metrics.apiHealthScore}/100`}
          icon={HeartPulse}
          className={metrics.apiHealthScore > 95 ? "border-success/20 bg-success/5" : ""}
        />
        <MetricCard
          label="System Uptime"
          value={`${uptimeDays} Days`}
          icon={Clock}
        />
        <MetricCard
          label="Memory Usage"
          value={`${metrics.memoryUsagePct}%`}
          icon={Cpu}
          deltaDirection={metrics.memoryUsagePct > 80 ? "down" : "flat"}
        />
        <MetricCard
          label="Notification Success"
          value={`${metrics.notificationSuccessRate}%`}
          icon={Bell}
        />
      </div>
    </div>
  );
}
