"use client";

import { useMemo, useState } from "react";
import { ChevronDown, SearchX } from "lucide-react";
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
import {
  REJECTION_GATE_LABEL,
  type ScanResult,
} from "@/features/scanner/data/mock-scan";
import type { Opportunity } from "@/features/scanner/types";

/**
 * What the scan found — ranked, best first, capped at ten.
 *
 * Ten is a deliberate ceiling. A scanner that hands back two hundred rows has
 * given you the problem back, not an answer.
 *
 * Beneath the result sits the evidence: how many pairs were checked, how many
 * were thrown away, and the exact number each one failed on. That is what makes
 * a thin result credible instead of suspicious — and a thin result is the
 * normal case, not a bug.
 */
export function ScanResults({
  result,
  onSelect,
}: {
  result: ScanResult;
  onSelect: (signal: Opportunity) => void;
}) {
  const [showRejections, setShowRejections] = useState(false);

  const rejectedCount = result.pairsChecked - result.ranked.length;

  const gateCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of result.rejections) {
      const label = REJECTION_GATE_LABEL[r.gate];
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [result.rejections]);

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
            {result.exchangesChecked}
          </span>{" "}
          {result.exchangesChecked === 1 ? "exchange" : "exchanges"}
        </span>
        <span>
          <span className="font-numeric font-medium text-success">
            {result.ranked.length}
          </span>{" "}
          passed
        </span>
        <span className="font-numeric text-xs">
          {(result.durationMs / 1000).toFixed(1)}s
        </span>
      </div>

      {result.ranked.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden />
          <h3 className="text-base font-semibold">Nothing passed.</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            {result.pairsChecked} pairs checked, none met the rules of the
            strategies you selected. Widen the strategies, or take the answer —
            not trading is a position.
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
                  <TableHead>Found by</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Stop</TableHead>
                  <TableHead className="text-right">R:R</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.ranked.map((signal) => (
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
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {signal.strategies.join(" + ")}
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
                      <ConfidenceBadge confidence={signal.confidence} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* The evidence, subordinate to the result */}
      <div>
        <button
          type="button"
          onClick={() => setShowRejections((v) => !v)}
          aria-expanded={showRejections}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              showRejections && "rotate-180",
            )}
            aria-hidden
          />
          See what was rejected
          <span className="font-numeric">({rejectedCount})</span>
        </button>

        {showRejections && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {gateCounts.map(([label, count]) => (
                <span
                  key={label}
                  className="rounded-md border px-2 py-1 text-xs text-muted-foreground"
                >
                  {label}
                  <span className="ml-1.5 font-numeric opacity-70">{count}</span>
                </span>
              ))}
            </div>

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pair</TableHead>
                      <TableHead>Strategy</TableHead>
                      <TableHead>Failed at</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rejections.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {r.pair}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {r.strategy}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
                            {REJECTION_GATE_LABEL[r.gate]}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <p className="text-xs text-muted-foreground">
              A sample of the rejections. Most are boring — the volume was not
              there, the confidence was too low. That is what a working scan
              looks like.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
