"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { RiskFlag, RiskFlagKind } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";

/**
 * The veto — and the only thing on this page that can actually change a trade.
 *
 * Everything else in Insights is context: it may make you *look* at a coin, but
 * it can never make the platform signal on one. A Risk Flag does the opposite,
 * and it is absolute: while one is live, no strategy may emit a signal on that
 * asset. Not an enabled one, not a proven one, not three of them agreeing.
 *
 * This is "Protect the Trader" as code. It is also the half of the old Oracle
 * module that should never have been a strategy — a veto belongs to the Risk
 * Engine, not to something competing for signals (ADR-023 §5).
 *
 * Two independent tier-1 sources are required before one fires: a false veto
 * costs a trader opportunity, but a missed one can cost them everything.
 */

const KIND_LABEL: Record<RiskFlagKind, string> = {
  EXPLOIT: "Exploit",
  DEPEG: "Depeg",
  DELISTING: "Delisting",
  REGULATORY: "Regulatory",
  OUTAGE: "Outage",
  UNLOCK: "Token unlock",
};

export function RiskFlags({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return (
      <Card className="flex items-center gap-3 border-success/30 bg-success/[0.03] p-4">
        <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-sm font-semibold">No risk flags. All markets clear.</p>
          <p className="text-xs text-muted-foreground">
            No hacks, depegs or exploits are blocking signals right now.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-destructive">
          Signals blocked
        </h2>
        <p className="text-xs text-muted-foreground">
          No strategy may trade these coins while the flag is live — however good
          the setup looks.
        </p>
      </div>

      <div className="space-y-3">
        {flags.map((flag) => {
          const remaining =
            new Date(flag.blockedUntil).getTime() - Date.now();

          return (
            <Card
              key={flag.id}
              className="gap-3 border-destructive/40 bg-destructive/[0.04] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden
                />
                <span className="text-base font-semibold tracking-tight">
                  {flag.coin}
                </span>
                <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  {KIND_LABEL[flag.kind]}
                </span>
                {remaining > 0 && (
                  <span className="ml-auto font-numeric text-xs text-muted-foreground">
                    blocked for {formatDuration(remaining)} more
                  </span>
                )}
              </div>

              <p className="text-sm font-medium">{flag.headline}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {flag.detail}
              </p>

              <p className="border-t pt-2 text-xs text-muted-foreground">
                Confirmed by {flag.sources.length} independent sources:{" "}
                {flag.sources.join(" · ")}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
