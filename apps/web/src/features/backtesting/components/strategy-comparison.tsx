"use client";

import { useBacktestingStore } from "@/stores/backtesting-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";

/**
 * Compares the active run with previous runs in the session.
 */
export function StrategyComparison({ className }: { className?: string }) {
  const history = useBacktestingStore((s) => s.history);

  if (history.length <= 1) return null;

  return (
    <Card className={className}>
      <div className="border-b px-6 py-4">
        <h3 className="font-semibold tracking-tight">Strategy Comparison</h3>
        <p className="text-sm text-muted-foreground">Compare the current run against previously executed backtests</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run Time</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Timeframe</TableHead>
              <TableHead className="text-right">Net Profit</TableHead>
              <TableHead className="text-right">Total Return</TableHead>
              <TableHead className="text-right">Max Drawdown</TableHead>
              <TableHead className="text-right">Win Rate</TableHead>
              <TableHead className="text-right">Profit Factor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((run, i) => {
              const isCurrent = i === 0;
              return (
                <TableRow key={run.id} className={isCurrent ? "bg-muted/30 font-medium" : ""}>
                  <TableCell className="whitespace-nowrap font-numeric text-muted-foreground">
                    {format(new Date(run.timestamp), "HH:mm:ss")}
                    {isCurrent && <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">CURRENT</span>}
                  </TableCell>
                  <TableCell>{run.config.strategy === "ALL" ? "Portfolio" : run.config.strategy}</TableCell>
                  <TableCell>{run.config.timeframe}</TableCell>
                  <TableCell className={`text-right font-numeric ${run.summary.netProfit > 0 ? "text-success" : "text-destructive"}`}>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(run.summary.netProfit)}
                  </TableCell>
                  <TableCell className={`text-right font-numeric ${run.summary.totalReturnPct > 0 ? "text-success" : "text-destructive"}`}>
                    {run.summary.totalReturnPct > 0 ? "+" : ""}{run.summary.totalReturnPct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-numeric text-destructive">
                    {run.summary.maxDrawdownPct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-numeric">
                    {run.summary.winRate.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-numeric">
                    {run.summary.profitFactor.toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
