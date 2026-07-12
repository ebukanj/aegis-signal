import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Info, ShieldAlert, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NotificationRule, AlertPriority } from "../types";

const priorityConfig: Record<AlertPriority, { icon: LucideIcon, color: string, label: string }> = {
  CRITICAL: { icon: ShieldAlert, color: "text-destructive border-destructive", label: "Critical" },
  HIGH: { icon: AlertTriangle, color: "text-warning border-warning", label: "High" },
  MEDIUM: { icon: Zap, color: "text-primary border-primary", label: "Medium" },
  LOW: { icon: Info, color: "text-muted-foreground border-muted", label: "Low" },
};

export function NotificationRules({ rules }: { rules: NotificationRule[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-lg">Alert Rules</h3>
        <p className="text-sm text-muted-foreground">Configure which events trigger notifications and their priority.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Channels</TableHead>
            <TableHead className="text-right">Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const priority = priorityConfig[rule.priority];
            const PIcon = priority.icon;
            
            return (
              <TableRow key={rule.id}>
                <TableCell>
                  <div className="font-medium">{rule.name}</div>
                  <div className="text-xs text-muted-foreground">{rule.description}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`gap-1 ${priority.color}`}>
                    <PIcon className="size-3" />
                    {priority.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {rule.channels.map(ch => (
                      <Badge key={ch} variant="secondary" className="text-[10px] uppercase">
                        {ch}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Switch checked={rule.enabled} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
