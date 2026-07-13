import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ScanContext } from "@/features/signals/data/mock-today";

/**
 * The most important empty state in the platform.
 *
 * Aegis Signal is built to say nothing when no trade is worth taking
 * (AGENTS.md §1). A quiet day is the risk rules doing their job, not a broken
 * feed — so this screen presents the silence as evidence, with the scan numbers
 * to back it up, and never apologises for it.
 */
export function NoSignals({ context }: { context: ScanContext }) {
  return (
    <Card className="flex flex-col items-center gap-5 border-dashed px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg border bg-card text-success">
        <ShieldCheck className="size-6" aria-hidden />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          No trades today.
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          <span className="font-numeric font-medium text-foreground">
            {context.pairsScanned}
          </span>{" "}
          pairs scanned across{" "}
          <span className="font-numeric font-medium text-foreground">
            {context.exchanges}
          </span>{" "}
          exchanges by{" "}
          <span className="font-numeric font-medium text-foreground">
            {context.strategiesActive}
          </span>{" "}
          active strategies. None met the rules.
        </p>
      </div>

      <p className="text-sm font-medium text-success">
        That&apos;s the system working.
      </p>

      <p className="mx-auto max-w-sm text-xs text-muted-foreground">
        Aegis Signal only speaks when a trade is worth taking. Protecting your
        capital on a quiet day is the same job as finding the trade on a loud
        one.
      </p>
    </Card>
  );
}
