"use client";

import { useEffect, useState } from "react";
import { Radar } from "lucide-react";
import type { Opportunity, ScanRequest, ScanResult } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { scannerApi } from "@/features/scanner/api/scanner-api";
import { ScanControls } from "@/features/scanner/components/scan-controls";
import { ScanResults } from "@/features/scanner/components/scan-results";
import { SignalPanel } from "@/features/signals/components/signal-panel";

/**
 * Market Scanner — a tool you operate, now running on the live pipeline (M15).
 *
 * The line between this and Signals:
 *
 *   SIGNALS  the machine decides — it hands you the few trades worth taking.
 *   SCANNER  you decide — you point it at a market and press Scan.
 *
 * Both are the SAME pipeline: market data → indicators → patterns → regime →
 * strategy → risk → confidence. The scanner just lets you watch it run against
 * the slice you choose. It opens on the most recent background sweep so the page
 * is never an empty shell, and re-runs on demand.
 */
export function ScannerPage() {
  const [request, setRequest] = useState<ScanRequest>({
    market: "ALL",
    timeframe: "ALL",
    exchange: "ALL",
  });

  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);

  // Open on the latest background sweep — the platform is always scanning, so the
  // page should reflect that rather than demand a click to show anything.
  useEffect(() => {
    let live = true;
    scannerApi
      .getLatest()
      .then((latest) => live && setResult(latest))
      .catch(() => live && setError(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const scan = async () => {
    setScanning(true);
    setError(false);
    try {
      setResult(await scannerApi.runScan(request));
    } catch {
      setError(true);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader
        title="Market Scanner"
        description="The live pipeline, pointed where you choose."
      />

      <ScanControls
        request={request}
        onChange={setRequest}
        onScan={scan}
        scanning={scanning}
      />

      {scanning && <ScanningState />}
      {!scanning && loading && <Skeleton className="h-64 w-full" />}
      {!scanning && !loading && error && <ErrorState />}
      {!scanning && !loading && !error && result && (
        <ScanResults result={result} onSelect={setSelected} />
      )}

      <SignalPanel signal={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ScanningState() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Running the pipeline across the universe…
      </p>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ErrorState() {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        <Radar className="size-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">
        The scan could not run.
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The market pipeline is unreachable right now. Press{" "}
        <span className="font-medium text-foreground">Scan the market</span> to
        try again — the platform keeps scanning in the background either way.
      </p>
    </Card>
  );
}
