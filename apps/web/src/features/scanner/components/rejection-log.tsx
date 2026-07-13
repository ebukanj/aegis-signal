"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  REJECTION_GATE_LABEL,
  type Rejection,
  type RejectionGate,
} from "@/features/scanner/data/mock-scan";

/**
 * Why nothing passed.
 *
 * This is the most trust-building screen in the platform, and the one most
 * signal products refuse to show. Anyone can display the winners. Showing every
 * setup the machine looked at and the exact number it failed on is what makes a
 * quiet day credible rather than suspicious.
 *
 * Note which gates dominate: entry conditions and the confidence floor. Most
 * rejections are boring, and that is the point — the risk gates (heat,
 * correlation, risk flags) are rare precisely because they are last-resort
 * vetoes.
 */
export function RejectionLog({ rejections }: { rejections: Rejection[] }) {
  const [gate, setGate] = useState<RejectionGate | "ALL">("ALL");

  const counts = useMemo(() => {
    const map = new Map<RejectionGate, number>();
    for (const r of rejections) map.set(r.gate, (map.get(r.gate) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rejections]);

  const rows = useMemo(
    () =>
      gate === "ALL"
        ? rejections
        : rejections.filter((r) => r.gate === gate),
    [rejections, gate],
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-tight">
          Rejected — and why
        </h2>
        <p className="text-xs text-muted-foreground">
          Every setup the scan looked at and threw away.
        </p>
      </div>

      {/* Gate filter — doubles as the distribution of failure reasons */}
      <div className="flex flex-wrap gap-1.5">
        <GateChip
          label="All"
          count={rejections.length}
          active={gate === "ALL"}
          onClick={() => setGate("ALL")}
        />
        {counts.map(([g, count]) => (
          <GateChip
            key={g}
            label={REJECTION_GATE_LABEL[g]}
            count={count}
            active={gate === g}
            onClick={() => setGate(g)}
          />
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
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {r.pair}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {r.exchange}
                    </span>
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
                  <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                    {formatRelativeTime(r.at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </section>
  );
}

function GateChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {label}
      <span className="ml-1.5 font-numeric opacity-70">{count}</span>
    </button>
  );
}
