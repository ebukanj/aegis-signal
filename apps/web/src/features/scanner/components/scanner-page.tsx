"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import type { Opportunity, ScanRequest } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { scannerApi } from "@/features/scanner/api/scanner-api";
import { ScanControls } from "@/features/scanner/components/scan-controls";
import { ScanResults } from "@/features/scanner/components/scan-results";
import { SignalPanel } from "@/features/signals/components/signal-panel";

/**
 * Market Scanner — a tool you operate, running on the live pipeline (M15).
 *
 * A full sweep takes minutes (exchange rate limits are real), so the API never
 * runs one inside a request. This page shows the latest completed sweep
 * instantly; pressing Scan kicks a fresh background sweep and the page polls
 * until its numbers land. `inProgress` is the honest signal that the pipeline is
 * working, not broken.
 */
export function ScannerPage() {
  const queryClient = useQueryClient();

  const [request, setRequest] = useState<ScanRequest>({
    market: "ALL",
    timeframe: "ALL",
    exchange: "ALL",
  });
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [scanning, setScanning] = useState(false);

  const query = useQuery({
    queryKey: ["scan", "latest"],
    queryFn: () => scannerApi.getLatest(),
    // Poll faster while a sweep runs, slower otherwise — the background worker
    // sweeps continuously, so the page stays current either way.
    refetchInterval: (q) => (q.state.data?.inProgress || scanning ? 5_000 : 60_000),
  });

  const scan = async () => {
    setScanning(true);
    try {
      const result = await scannerApi.runScan(request);
      queryClient.setQueryData(["scan", "latest"], result);
    } finally {
      // Polling takes over from here; the flag just tightens the interval.
      setTimeout(() => setScanning(false), 30_000);
    }
  };

  const result = query.data;

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
        scanning={Boolean(result?.inProgress || scanning)}
      />

      {query.isPending && <Skeleton className="h-64 w-full" />}

      {query.isError && <ErrorState />}

      {result && <ScanResults result={result} onSelect={setSelected} />}

      <SignalPanel signal={selected} onClose={() => setSelected(null)} />
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
        The scanner could not be reached.
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The API did not answer. It retries automatically — the background scan
        keeps running regardless.
      </p>
    </Card>
  );
}
