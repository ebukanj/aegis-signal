"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAdminStore } from "../stores/admin-store";
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
import { UserAdministration } from "./user-administration";
import { ExchangeManagement } from "./exchange-management";
import { QueueMonitoring } from "./queue-monitoring";
import { FeatureFlags } from "./feature-flags";
import { LogViewer } from "./log-viewer";
import { MaintenanceMode } from "./maintenance-mode";
import { useAuthStore } from "@/features/auth/stores/auth-store";

/**
 * The admin console — and every panel in it is REAL.
 *
 * The mock panels it used to carry (invented worker nodes, fake AI providers,
 * fabricated monitoring charts, made-up system logs) are deleted, not hidden: an
 * operator who cannot trust one card stops trusting the console. What remains
 * reads the live `/admin` API and the live user store, and the guard is real
 * RBAC — a signed-in ADMIN, or the operator token for machines.
 */
export function AdminWorkspace() {
  const { activeCategory } = useAdminStore();
  const role = useAuthStore((s) => s.user?.role);
  const overviewQuery = useAdminOverview();
  const auditQuery = useAuditLog();
  const setFlag = useSetFlag();
  const setMaintenance = useSetMaintenance();

  const overview = overviewQuery.data;

  // The server is the real boundary; this just tells a TRADER the truth up front
  // instead of letting them watch every panel 403.
  if (role && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return (
      <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
        <ShieldAlert className="size-6 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">Admins only.</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This console manages the platform itself. Your account is a {role.toLowerCase()} —
          ask the platform admin if you need something changed.
        </p>
      </Card>
    );
  }

  // Users reads its own endpoint; everything else needs the overview.
  const needsOverview = activeCategory !== "users";

  const renderContent = () => {
    if (needsOverview) {
      if (overviewQuery.isLoading) {
        return (
          <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
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
      case "users":
        return <UserAdministration />;
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
      case "audit-logs":
        return <LogViewer auditLogs={toAuditLogs(auditQuery.data ?? [])} systemLogs={[]} type="audit" />;
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
      default:
        return <div>Select a category</div>;
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-20 pt-4 lg:flex-row">
      <AdminSidebar />
      <div className="min-h-[600px] min-w-0 flex-1">{renderContent()}</div>
    </div>
  );
}

function AdminError({ message }: { message?: string }) {
  const forbidden =
    message?.toLowerCase().includes("token") || message?.toLowerCase().includes("admin");
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <div className="flex items-start gap-3 p-6">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="text-sm">
          <div className="font-medium text-destructive">Could not load admin data</div>
          <p className="mt-1 text-muted-foreground">
            {forbidden
              ? "The admin API refused the request — this console needs an ADMIN account (the first account registered on the platform)."
              : (message ?? "The API is unreachable. Is the backend running?")}
          </p>
        </div>
      </div>
    </Card>
  );
}
