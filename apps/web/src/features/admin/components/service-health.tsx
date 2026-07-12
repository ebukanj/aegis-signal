import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bot, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ServiceProvider } from "../types";

export function ServiceHealth({ services }: { services: ServiceProvider[] }) {
  const aiProviders = services.filter(s => s.type === "ai");
  const notificationProviders = services.filter(s => s.type === "notification");

  const renderTable = (data: ServiceProvider[], icon: LucideIcon) => {
    const Icon = icon;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Latency</TableHead>
            <TableHead>Usage / Quota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(service => (
            <TableRow key={service.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="font-medium">{service.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={`border-transparent text-[10px] uppercase ${
                    service.status === "healthy" ? "bg-success/10 text-success" :
                    service.status === "degraded" ? "bg-warning/10 text-warning" :
                    "bg-destructive/10 text-destructive"
                  }`}
                >
                  {service.status}
                </Badge>
              </TableCell>
              <TableCell className="font-numeric text-sm">
                {service.latencyMs}ms
              </TableCell>
              <TableCell className="text-sm">
                <span className="font-numeric">{service.usageCount.toLocaleString()}</span>
                {service.quotaMax && (
                  <span className="text-muted-foreground font-numeric"> / {service.quotaMax.toLocaleString()}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">External Services</h2>
        <p className="text-muted-foreground text-sm mt-1">Monitor the health and API quotas of third-party dependencies.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">AI Providers</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Used for signal explanations and NLP.</p>
          </div>
          {renderTable(aiProviders, Bot)}
        </Card>

        <Card>
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Notification Services</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Used for delivering alerts to end-users.</p>
          </div>
          {renderTable(notificationProviders, Bell)}
        </Card>
      </div>
    </div>
  );
}
