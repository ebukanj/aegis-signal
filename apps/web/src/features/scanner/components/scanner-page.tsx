"use client";

import { useState } from "react";
import { Radar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrategyStore } from "@/features/strategies/stores/strategy-store";
import { scannerApi } from "@/features/scanner/api/scanner-api";
import { ScanControls } from "@/features/scanner/components/scan-controls";
import { ScanResults } from "@/features/scanner/components/scan-results";
import { SignalPanel } from "@/features/signals/components/signal-panel";
import type { ScanRequest, ScanResult } from "@/features/scanner/data/mock-scan";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Market Scanner — a tool you operate.
 *
 * The line between this and Signals is the thing that was confused before:
 *
 *   SIGNALS  the machine decides. It hands you the few trades worth taking.
 *   SCANNER  you decide. You pick the rules and go looking.
 *
 * So this page does nothing until you tell it to. That is not a limitation —
 * it is what makes it a scanner rather than a second, noisier feed.
 */
export function ScannerPage() {
  const strategies = useStrategyStore((s) => s.strategies);

  const [request, setRequest] = useState<ScanRequest>(() => ({
    strategies: strategies.filter((s) => s.enabled).map((s) => s.name),
    market: "ALL",
    exchange: "ALL",
    timeframe: "ALL",
  }));

  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const scan = async () => {
    setScanning(true);
    try {
      setResult(await scannerApi.runScan(request));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader
        title="Market Scanner"
        description="Scan the market with the rules you choose."
      />

      <ScanControls
        request={request}
        onChange={setRequest}
        onScan={scan}
        scanning={scanning}
      />

      {scanning && <ScanningState />}

      {!scanning && result && (
        <ScanResults result={result} onSelect={setSelected} />
      )}

      {!scanning && !result && <IdleState />}

      <SignalPanel signal={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** What a first-time visitor sees. It has to teach the page in two sentences. */
function IdleState() {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        <Radar className="size-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">
        Nothing scanned yet.
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Choose the strategies you want to hunt with above, then press{" "}
        <span className="font-medium text-foreground">Scan the market</span>.
        You will get the ten best setups the rules can find right now, ranked.
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        Looking for the trades the platform picked for you instead? Those are on
        the Signals page — this one is for going hunting yourself.
      </p>
    </Card>
  );
}

function ScanningState() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Checking 247 pairs across 5 exchanges…
      </p>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
