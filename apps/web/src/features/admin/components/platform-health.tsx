import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Server, RefreshCw, Layers, ArrowRightLeft, Bell, Bot, HardDrive } from "lucide-react";
import type { PlatformHealth, HealthStatus } from "../types";

const statusConfig: Record<HealthStatus, { color: string, label: string }> = {
  healthy: { color: "bg-success text-success-foreground", label: "Healthy" },
  warning: { color: "bg-warning text-warning-foreground", label: "Degraded" },
  critical: { color: "bg-destructive text-destructive-foreground", label: "Critical" },
  offline: { color: "bg-muted text-muted-foreground", label: "Offline" },
};

export function PlatformHealthView({ health }: { health: PlatformHealth }) {
  const components = [
    { key: "apiStatus", name: "Core API", icon: Activity, desc: "REST & GraphQL Endpoints" },
    { key: "database", name: "PostgreSQL", icon: Database, desc: "Primary Data Store" },
    { key: "redis", name: "Redis Cache", icon: Server, desc: "In-memory Data Store" },
    { key: "bullMq", name: "BullMQ", icon: Layers, desc: "Message Queues" },
    { key: "marketScanner", name: "Market Scanner", icon: RefreshCw, desc: "Price Data Ingestion" },
    { key: "websocketServer", name: "WebSockets", icon: Activity, desc: "Real-time Pushes" },
    { key: "exchangeConnections", name: "Exchanges", icon: ArrowRightLeft, desc: "CCXT Integrations" },
    { key: "notificationServices", name: "Notifications", icon: Bell, desc: "Delivery Pipelines" },
    { key: "aiServices", name: "AI Gateway", icon: Bot, desc: "LLM Providers" },
    { key: "storage", name: "Object Storage", icon: HardDrive, desc: "S3 Compatible Store" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Platform Health</h2>
        <p className="text-muted-foreground text-sm mt-1">Real-time status of critical infrastructure components.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {components.map((comp) => {
          const statusVal = health[comp.key as keyof PlatformHealth] as HealthStatus;
          const config = statusConfig[statusVal];
          const Icon = comp.icon;

          return (
            <Card key={comp.key} className="p-5 flex flex-col gap-4 relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${
                statusVal === "healthy" ? "bg-success" : 
                statusVal === "warning" ? "bg-warning" : 
                statusVal === "critical" ? "bg-destructive" : "bg-muted"
              }`} />
              <div className="flex justify-between items-start pl-2">
                <div className="flex items-center gap-3">
                  <div className="bg-muted p-2 rounded-md">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{comp.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{comp.desc}</p>
                  </div>
                </div>
              </div>
              <div className="pl-2 pt-2 border-t mt-auto">
                <div className="flex items-center gap-2">
                  <div className={`size-2.5 rounded-full ${statusVal === "healthy" ? "bg-success animate-pulse" : config.color}`} />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {config.label}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
