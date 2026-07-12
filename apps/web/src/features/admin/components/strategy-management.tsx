import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, Play, Square, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminStrategy } from "../types";

export function StrategyManagement({ strategies }: { strategies: AdminStrategy[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Strategy Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Control system-wide algorithmic trading strategies.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">Signals (24h)</TableHead>
              <TableHead className="text-right">Win Rate</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategies.map((strategy) => (
              <TableRow key={strategy.id}>
                <TableCell>
                  <div className="font-medium">{strategy.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{strategy.version}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {strategy.status === "running" ? (
                      <Play className="size-3 text-success" />
                    ) : strategy.status === "stopped" ? (
                      <Square className="size-3 text-muted-foreground" />
                    ) : (
                      <AlertTriangle className="size-3 text-destructive" />
                    )}
                    <span className="text-xs font-medium uppercase text-muted-foreground">{strategy.status}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`border-transparent text-[10px] uppercase ${
                      strategy.health === "healthy" ? "bg-success/10 text-success" :
                      strategy.health === "critical" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {strategy.health}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-numeric text-sm">
                  {strategy.signalsToday.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-numeric text-sm">
                  {strategy.winRate > 0 ? `${strategy.winRate}%` : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Switch checked={strategy.enabled} />
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
