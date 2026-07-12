"use client";

import { useAdminStore } from "../stores/admin-store";
import { mockAdminData } from "../data/mock-admin";
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

export function AdminWorkspace() {
  const { activeCategory } = useAdminStore();
  const data = mockAdminData;

  const renderContent = () => {
    switch (activeCategory) {
      case "dashboard":
        return <AdminDashboard metrics={data.dashboard} />;
      case "health":
        return <PlatformHealthView health={data.health} />;
      case "users":
        return <UserManagement users={data.users} />;
      case "roles":
        return <RolesPermissions roles={data.roles} />;
      case "strategies":
        return <StrategyManagement strategies={data.strategies} />;
      case "exchanges":
        return <ExchangeManagement exchanges={data.exchanges} />;
      case "scanner":
        // Fallback for missing scanner specific UI for now (using queue visualization mostly)
        return (
          <div className="p-8 border rounded-lg bg-muted/30 text-center">
            <h3 className="font-semibold text-lg">Market Scanner Diagnostics</h3>
            <p className="text-muted-foreground mt-2">See Queues or Workers for active processing status.</p>
          </div>
        );
      case "queues":
        return <QueueMonitoring queues={data.queues} />;
      case "workers":
        return <WorkerManagement workers={data.workers} />;
      case "notifications":
      case "ai-providers":
        return <ServiceHealth services={data.services} />;
      case "feature-flags":
        return <FeatureFlags flags={data.featureFlags} />;
      case "audit-logs":
        return <LogViewer auditLogs={data.auditLogs} systemLogs={[]} type="audit" />;
      case "system-logs":
        return <LogViewer auditLogs={[]} systemLogs={data.systemLogs} type="system" />;
      case "monitoring":
        return <MonitoringCharts monitoring={data.monitoring} />;
      case "configuration":
        return <SystemConfiguration />;
      case "maintenance":
        return <MaintenanceMode />;
      default:
        return <div>Select a category</div>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 pb-20 pt-4">
      <AdminSidebar />
      <div className="flex-1 min-w-0 min-h-[600px]">
        {renderContent()}
      </div>
    </div>
  );
}
