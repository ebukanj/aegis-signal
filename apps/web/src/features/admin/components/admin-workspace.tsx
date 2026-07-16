"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAdminStore } from "../stores/admin-store";
import { mockAdminData } from "../data/mock-admin";
import { useAdminOverview, useAuditLog, useSetFlag, useSetMaintenance } from "../api/use-admin";
import {
  toAuditLogs,
  toDashboardMetrics,
  toExchanges,
  toFeatureFlags,
  toPlatformHealth,
  toQueues,
} from "../api/adapters";
import { AdminSidebar } from "./admin-sidebar";
import { AdminDashboard } from "./admin-dashboard";
import { PlatformHealthView } from "./platform-health";
import { UserManagement } from "./user-management";
import { RolesPermissions } from "./roles-permissions";
import { StrategyManagement } from "./strategy-management";
import { ExchangeManagement } from "./exchange-management";
import { QueueMonitoring } from "./queue-monitoring";
import { WorkerManagement } from "./worker-management";
import { ServiceHealth } from "./service-health";
import { FeatureFlags } from "./feature-flags";
import { LogViewer } from "./log-viewer";
import { MonitoringCharts } from "./monitoring-charts";
import { SystemConfiguration } from "./system-configuration";
import { MaintenanceMode } from "./maintenance-mode";
import { NotLiveBanner } from "./not-live-banner";

/**
 * The admin console.
 *
 * Live surfaces read the real `/admin` API (M14): the dashboard, platform health,
 * exchanges, queues, feature flags, audit log and maintenance mode. The rest —
 * users, roles, strategy administration, workers, service providers, historical
 * monitoring, system logs — have no backend yet and render clearly-labelled
 * placeholders behind a NotLiveBanner, never silently faked.
 *
 * The whole console is guarded by the admin token: open in local development so it
 * just works, and closed in production until real operator auth (the Users
 * milestone) replaces the token.
 */
export function AdminWorkspace() {
  const { activeCategory } = useAdminStore();
  const overviewQuery = useAdminOverview();
  const auditQuery = useAuditLog();
  const setFlag = useSetFlag();
  const setMaintenance = useSetMaintenance();

  const overview = overviewQuery.data;
  const mock = mockAdminData;

  const liveCategories = new Set([
    "dashboard",
    "health",
    "exchanges",
    "queues",
    "feature-flags",
    "maintenance",
    "audit-logs",
  ]);

  const renderContent = () => {
    // Live surfaces need the overview; show load / error states honestly.
    if (liveCategories.has(activeCategory)) {
      if (overviewQuery.isLoading) {
        return (
          <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
            <Loader2 className="size-5 animate-spin" /> Loading live platform data…
          </div>
        );
      }
      if (overviewQuery.isError || !overview) {
        return <AdminError message={(overviewQuery.error as Error | undefined)?.message} />;
      }
    }

    switch (activeCategory) {
      case "dashboard":
        return <AdminDashboard metrics={toDashboardMetrics(overview!)} />;
      case "health":
        return <PlatformHealthView health={toPlatformHealth(overview!)} />;
      case "exchanges":
        return <ExchangeManagement exchanges={toExchanges(overview!)} />;
      case "queues":
        return <QueueMonitoring queues={toQueues(overview!)} />;
      case "feature-flags":
        return (
          <FeatureFlags
            flags={toFeatureFlags(overview!)}
            pendingKey={setFlag.isPending ? setFlag.variables?.key : null}
            onToggle={(key, enabled) => setFlag.mutate({ key, change: { enabled } })}
          />
        );
      case "maintenance":
        return (
          <MaintenanceMode
            state={overview!.maintenance}
            pending={setMaintenance.isPending}
            onToggle={(enabled) =>
              setMaintenance.mutate({
                enabled,
                message: enabled
                  ? "Aegis Signal is undergoing maintenance. Please check back shortly."
                  : undefined,
              })
            }
          />
        );
      case "audit-logs":
        return <LogViewer auditLogs={toAuditLogs(auditQuery.data ?? [])} systemLogs={[]} type="audit" />;

      // ── Surfaces awaiting their milestone — honest placeholders ──────────
      case "users":
        return (
          <Placeholder milestone="the Users & Auth milestone" what="User administration">
            <UserManagement users={mock.users} />
          </Placeholder>
        );
      case "roles":
        return (
          <Placeholder milestone="the Users & Auth milestone" what="Roles & permissions">
            <RolesPermissions roles={mock.roles} />
          </Placeholder>
        );
      case "strategies":
        return (
          <Placeholder milestone="a later milestone" what="Strategy administration">
            <StrategyManagement strategies={mock.strategies} />
          </Placeholder>
        );
      case "workers":
        return (
          <Placeholder milestone="a later milestone" what="Worker-node introspection">
            <WorkerManagement workers={mock.workers} />
          </Placeholder>
        );
      case "notifications":
      case "ai-providers":
        return (
          <Placeholder milestone="a later milestone" what="Provider health & quotas">
            <ServiceHealth services={mock.services} />
          </Placeholder>
        );
      case "system-logs":
        return (
          <Placeholder milestone="a later milestone" what="Queryable system logs">
            <LogViewer auditLogs={[]} systemLogs={mock.systemLogs} type="system" />
          </Placeholder>
        );
      case "monitoring":
        return (
          <Placeholder milestone="a later milestone" what="Historical resource charts">
            <MonitoringCharts monitoring={mock.monitoring} />
          </Placeholder>
        );

      case "scanner":
        return (
          <div className="p-8 border rounded-lg bg-muted/30 text-center">
            <h3 className="font-semibold text-lg">Market Scanner Diagnostics</h3>
            <p className="text-muted-foreground mt-2">See Queues or Workers for active processing status.</p>
          </div>
        );
      case "configuration":
        return <SystemConfiguration />;
      default:
        return <div>Select a category</div>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 pb-20 pt-4">
      <AdminSidebar />
      <div className="flex-1 min-w-0 min-h-[600px]">{renderContent()}</div>
    </div>
  );
}

function Placeholder({
  milestone,
  what,
  children,
}: {
  milestone: string;
  what: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <NotLiveBanner milestone={milestone} what={what} />
      {children}
    </div>
  );
}

function AdminError({ message }: { message?: string }) {
  const forbidden = message?.toLowerCase().includes("token") || message?.toLowerCase().includes("forbidden");
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <div className="p-6 flex gap-3 items-start">
        <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium text-destructive">Could not load admin data</div>
          <p className="text-muted-foreground mt-1">
            {forbidden
              ? "The admin API refused the request. In production the console needs an admin token (NEXT_PUBLIC_ADMIN_TOKEN) until real operator auth lands."
              : (message ?? "The API is unreachable. Is the backend running?")}
          </p>
        </div>
      </div>
    </Card>
  );
}
