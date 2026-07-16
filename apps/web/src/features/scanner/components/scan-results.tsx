"use client";

import { SearchX } from "lucide-react";
import type { Opportunity, ScanResult } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What the scan found — ranked, best first.
 *
 * Above the table sits the receipt: how many pairs were checked, across how many
 * exchanges, and how long it took. That is what makes a thin result credible
 * rather than suspicious — and a thin result, or none at all, is the normal case,
 * not a bug. Silence is a feature.
 */
export function ScanResults({
  result,
  onSelect,
}: {
  result: ScanResult;
  onSelect: (signal: Opportunity) => void;
}) {
  return (
    <section className="space-y-3">
      {/* The receipt */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-numeric font-medium text-foreground">
            {result.pairsChecked}
          </span>{" "}
          pairs checked across{" "}
          <span className="font-numeric font-medium text-foreground">
            {result.exchanges}
          </span>{" "}
          {result.exchanges === 1 ? "exchange" : "exchanges"}
        </span>
        <span>
          <span className="font-numeric font-medium text-success">
            {result.passed}
          </span>{" "}
          passed
        </span>
        <span className="font-numeric text-xs">
          {(result.durationMs / 1000).toFixed(1)}s
        </span>
      </div>

      {result.opportunities.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden />
          <h3 className="text-base font-semibold">Nothing passed.</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            {result.pairsChecked} pairs checked, none met the rules right now.
            Not trading is a position — the platform keeps scanning, and a real
            setup will appear here the moment one exists.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Timeframe</TableHead>
                  <TableHead>Found by</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Stop</TableHead>
                  <TableHead className="text-right">R:R</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.opportunities.map((signal) => (
                  <TableRow
                    key={signal.id}
                    onClick={() => onSelect(signal)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-numeric text-muted-foreground">
                      {signal.rank}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {signal.pair}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {signal.exchange}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DirectionBadge direction={signal.direction} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-numeric text-xs text-muted-foreground">
                      {signal.timeframe}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {signal.strategies.join(" + ")}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-numeric",
                        signal.currentPrice === null && "text-muted-foreground",
                      )}
                    >
                      {signal.currentPrice === null
                        ? "—"
                        : formatPrice(signal.currentPrice)}
                    </TableCell>
                    <TableCell className="text-right font-numeric">
                      {formatPrice(signal.entryPrice)}
                    </TableCell>
                    <TableCell className="text-right font-numeric text-destructive">
                      {formatPrice(signal.stopLoss)}
                    </TableCell>
                    <TableCell className="text-right font-numeric">
                      {signal.rewardRisk}R
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfidenceBadge score={signal.confidence} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </section>
  );
}
