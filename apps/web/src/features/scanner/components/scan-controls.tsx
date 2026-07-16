"use client";

import { Radar } from "lucide-react";
import type { ScanRequest } from "@aegis/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The exchanges the platform actually scans. OKX is intentionally absent — it is
 * disabled in the backend (no derivatives feed we can trust), so offering it here
 * would promise a venue the scan never touches. Binance and Bybit are live.
 */
const EXCHANGES = ["Binance", "Bybit"] as const;

/**
 * The scanner's controls.
 *
 * You choose the slice — market, timeframe, exchange — and press Scan. The scan
 * runs your ACTIVE strategies (the ones enabled on the Strategies page); a rule
 * you have switched off does not hunt, because a rule you rejected should not
 * surface trades (ADR-024). Per-scan strategy selection returns with the Users
 * milestone, when a scan can be tied to who ran it.
 */
export function ScanControls({
  request,
  onChange,
  onScan,
  scanning,
}: {
  request: ScanRequest;
  onChange: (request: ScanRequest) => void;
  onScan: () => void;
  scanning: boolean;
}) {
  return (
    <Card className="gap-5 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">
          Scan the market
        </h2>
        <p className="text-xs text-muted-foreground">
          Point the live pipeline at a slice of the market. It runs your active
          strategies and ranks whatever passes risk and confidence — best first.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="scan-market" className="text-xs">
            Market
          </Label>
          <Select
            value={request.market}
            onValueChange={(v: ScanRequest["market"]) =>
              onChange({ ...request, market: v })
            }
          >
            <SelectTrigger id="scan-market" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Spot &amp; Perpetuals</SelectItem>
              <SelectItem value="SPOT">Spot only</SelectItem>
              <SelectItem value="PERPETUAL">Perpetuals only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Signals are multi-timeframe. The same rule on the 15m and the 4h are
            different trades with different holding periods — a scalper and a
            swing trader use the same strategies for different purposes. */}
        <div className="space-y-1.5">
          <Label htmlFor="scan-timeframe" className="text-xs">
            Timeframe
          </Label>
          <Select
            value={request.timeframe}
            onValueChange={(v: ScanRequest["timeframe"]) =>
              onChange({ ...request, timeframe: v })
            }
          >
            <SelectTrigger id="scan-timeframe" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any timeframe</SelectItem>
              <SelectItem value="15m">15m — scalps</SelectItem>
              <SelectItem value="1h">1h — intraday</SelectItem>
              <SelectItem value="4h">4h — swing</SelectItem>
              <SelectItem value="1d">1d — position</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scan-exchange" className="text-xs">
            Exchange
          </Label>
          <Select
            value={request.exchange}
            onValueChange={(v) => onChange({ ...request, exchange: v })}
          >
            <SelectTrigger id="scan-exchange" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Binance &amp; Bybit</SelectItem>
              {EXCHANGES.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onScan}
          disabled={scanning}
          className="ml-auto min-w-40"
          size="lg"
        >
          <Radar className={cn(scanning && "animate-spin")} />
          {scanning ? "Scanning…" : "Scan the market"}
        </Button>
      </div>
    </Card>
  );
}
