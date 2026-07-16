"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Activity, ArrowRightLeft, HeartPulse, Clock, Cpu, Bell } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { adminUsersApi } from "@/features/admin/api/users-api";
import type { AdminDashboardMetrics } from "../types";

/**
 * The platform on one screen — and every number is measured.
 *
 * The first version decorated these cards with invented deltas ("+12%", "1
 * degraded", "/ 6" exchanges that never existed). They are gone: a KPI card
 * with a made-up trend teaches an operator to ignore the whole dashboard. What
 * remains is what the backend actually reports, plus the real user count from
 * the real user store.
 */
export function AdminDashboard({ metrics }: { metrics: AdminDashboardMetrics }) {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => adminUsersApi.list() });

  const uptime = formatUptime(metrics.systemUptimeSeconds);
  const activeUsers = users.data ? users.data.filter((u) => !u.suspended).length : null;

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">Platform overview — every number measured, none invented.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          label="Users"
          value={activeUsers === null ? "…" : activeUsers.toLocaleString()}
          icon={Users}
          delta={
            users.data && users.data.some((u) => u.suspended)
              ? `${users.data.filter((u) => u.suspended).length} suspended`
              : undefined
          }
          deltaDirection="flat"
        />
        <MetricCard
          label="Signals (All Time)"
          value={metrics.signalsToday.toLocaleString()}
          icon={Activity}
        />
        <MetricCard
          label="Exchanges Online"
          value={`${metrics.onlineExchanges} / ${metrics.totalExchanges}`}
          icon={ArrowRightLeft}
          delta={metrics.onlineExchanges < metrics.totalExchanges ? "one is down" : undefined}
          deltaDirection={metrics.onlineExchanges < metrics.totalExchanges ? "down" : "flat"}
        />
        <MetricCard
          label="API Health"
          value={`${metrics.apiHealthScore}/100`}
          icon={HeartPulse}
          className={metrics.apiHealthScore >= 95 ? "border-success/20 bg-success/5" : ""}
        />

        <MetricCard label="Uptime" value={uptime} icon={Clock} />
        <MetricCard
          label="Memory Usage"
          value={`${metrics.memoryUsagePct}%`}
          icon={Cpu}
          deltaDirection={metrics.memoryUsagePct > 85 ? "down" : "flat"}
        />
        <MetricCard
          label="CPU Load"
          value={`${metrics.cpuUsagePct}%`}
          icon={Cpu}
          deltaDirection={metrics.cpuUsagePct > 85 ? "down" : "flat"}
        />
        <MetricCard
          label="Notification Delivery"
          value={`${metrics.notificationSuccessRate}%`}
          icon={Bell}
        />
      </div>
    </div>
  );
}

/** "3d 4h" for long uptimes, "4h 12m" under a day, "23m" under an hour. */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
