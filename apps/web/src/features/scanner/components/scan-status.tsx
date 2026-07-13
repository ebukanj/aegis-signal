"use client";

import { formatRelativeTime } from "@/lib/format";
import type { ScanRun } from "@/features/scanner/data/mock-scan";

/**
 * The scan, in one line.
 *
 * This replaces eight metric cards of counts. A trader does not need to be told
 * "avg confidence: 74" in a box — they need to know the machine is running,
 * how wide it looked, and how little survived.
 */
export function ScanStatus({ scan }: { scan: ScanRun }) {
  const rejected = scan.rejections.length;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <span className="font-medium">Scanning</span>
      </div>

      <Stat value={scan.pairsScanned} label="pairs" />
      <Stat value={scan.exchanges} label="exchanges" />
      <Stat
        value={scan.strategyRuns.filter((s) => s.state === "SCANNING").length}
        label="strategies live"
      />

      <span className="text-muted-foreground">
        <span className="font-numeric font-medium text-success">
          {scan.promoted}
        </span>{" "}
        passed ·{" "}
        <span className="font-numeric font-medium text-foreground">
          {rejected}
        </span>{" "}
        rejected
      </span>

      <span className="ml-auto text-xs text-muted-foreground">
        last scan {formatRelativeTime(scan.lastScanAt)} · next in{" "}
        <span className="font-numeric">{scan.nextScanInSeconds}s</span>
      </span>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-muted-foreground">
      <span className="font-numeric font-medium text-foreground">{value}</span>{" "}
      {label}
    </span>
  );
}
