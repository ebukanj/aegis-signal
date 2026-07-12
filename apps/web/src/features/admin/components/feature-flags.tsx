import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal } from "lucide-react";
import type { FeatureFlag } from "../types";

export function FeatureFlags({ flags }: { flags: FeatureFlag[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Feature Flags</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage gradual rollouts and kill switches.</p>
        </div>
        <Button className="gap-2">
          <Plus className="size-4" /> Create Flag
        </Button>
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
              <TableHead className="w-[50px]"></TableHead>
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
                  <Switch checked={flag.enabled} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
