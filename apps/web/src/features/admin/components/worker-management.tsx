import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Cpu, MoreHorizontal, Power, RefreshCcw } from "lucide-react";
import type { WorkerNode } from "../types";

export function WorkerManagement({ workers }: { workers: WorkerNode[] }) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const formatUptime = (seconds: number) => {
    if (seconds === 0) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Worker Nodes</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage processing nodes for background tasks.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead>Tasks Processed</TableHead>
              <TableHead>Uptime</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.map(worker => (
              <TableRow key={worker.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-muted-foreground" />
                    <span className="font-medium">{worker.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`border-transparent text-[10px] uppercase ${
                      worker.status === "active" ? "bg-success/10 text-success" :
                      worker.status === "idle" ? "bg-warning/10 text-warning" :
                      "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {worker.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div 
                        className={`h-full ${worker.cpuUsage > 80 ? 'bg-destructive' : 'bg-primary'}`} 
                        style={{ width: `${worker.cpuUsage}%` }}
                      />
                    </div>
                    <span className="text-xs font-numeric">{worker.cpuUsage}%</span>
                  </div>
                </TableCell>
                <TableCell className="font-numeric text-sm">
                  {formatBytes(worker.memoryUsageBytes)}
                </TableCell>
                <TableCell className="font-numeric text-sm">
                  {worker.tasksProcessed.toLocaleString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatUptime(worker.uptimeSeconds)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <RefreshCcw className="size-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Power className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
