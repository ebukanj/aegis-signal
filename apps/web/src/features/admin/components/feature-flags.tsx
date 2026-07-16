import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FeatureFlag } from "../types";

/**
 * Feature flags — LIVE and interactive. Each switch flips a real runtime flag on the
 * backend (kill switches and rollouts); the change is persisted and audited, and the
 * platform obeys it on the next request. `onToggle` and `pending` are supplied by the
 * workspace, which owns the mutation.
 */
export function FeatureFlags({
  flags,
  onToggle,
  pendingKey,
}: {
  flags: FeatureFlag[];
  onToggle?: (key: string, enabled: boolean) => void;
  pendingKey?: string | null;
}) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Feature Flags</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Runtime kill switches and rollouts — changes take effect immediately, no deploy.
          </p>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature Key</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Rollout %</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.map((flag) => (
              <TableRow key={flag.id}>
                <TableCell>
                  <div className="font-medium text-sm">{flag.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{flag.description}</div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] uppercase border-transparent ${
                      flag.environment === "production" ? "bg-destructive/10 text-destructive" :
                      flag.environment === "staging" ? "bg-warning/10 text-warning" :
                      "bg-primary/10 text-primary"
                    }`}
                  >
                    {flag.environment}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${flag.rolloutPercentage}%` }}
                      />
                    </div>
                    <span className="text-xs font-numeric">{flag.rolloutPercentage}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(flag.createdAt * 1000).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={flag.enabled}
                    disabled={!onToggle || pendingKey === flag.id}
                    onCheckedChange={(checked) => onToggle?.(flag.id, checked)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
