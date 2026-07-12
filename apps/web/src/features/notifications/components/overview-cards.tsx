import { MetricCard } from "@/components/shared/metric-card";
import { Bell, AlertCircle, ShieldAlert, CheckCircle2, Clock, Moon } from "lucide-react";
import type { NotificationOverview } from "../types";

export function OverviewCards({ overview }: { overview: NotificationOverview }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 mb-6">
      <MetricCard
        label="Today's Alerts"
        value={overview.notificationsToday.toString()}
        icon={Bell}
        delta={`${overview.unreadCount} unread`}
        deltaDirection="flat"
      />
      <MetricCard
        label="High Priority"
        value={overview.highPriorityToday.toString()}
        icon={AlertCircle}
        hint="Critical or High"
      />
      <MetricCard
        label="Failed Deliveries"
        value={overview.failedToday.toString()}
        icon={ShieldAlert}
        deltaDirection={overview.failedToday > 0 ? "down" : "up"}
        className={overview.failedToday > 0 ? "border-destructive/50" : ""}
      />
      <MetricCard
        label="Delivery Success"
        value={`${overview.successRate}%`}
        icon={CheckCircle2}
        hint="Last 30 days"
      />
      <MetricCard
        label="Last Alert"
        value={new Date(overview.lastNotificationTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        icon={Clock}
      />
      <MetricCard
        label="Quiet Hours"
        value={overview.quietHoursActive ? "Active" : "Disabled"}
        icon={Moon}
        className={overview.quietHoursActive ? "bg-primary/5 border-primary/20" : ""}
      />
    </div>
  );
}
