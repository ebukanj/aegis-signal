"use client";

import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUILT_IN_STRATEGIES } from "@/constants/strategies";
import { cn } from "@/lib/utils";
import type { ScanRequest } from "@/features/scanner/data/mock-scan";

const EXCHANGES = ["Binance", "Bybit", "OKX", "Bitget", "KuCoin"];

/**
 * The scanner's controls.
 *
 * Someone landing here for the first time, knowing nothing about the platform,
 * must be able to see what this page is for and what to do. So: a plain
 * instruction, checkboxes with the strategies described in one line each, and
 * one obvious button.
 *
 * A strategy that is switched OFF in your normal setup can still be scanned
 * with here — that is the point of a tool. You are exploring, not being served.
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
  const toggle = (name: string) => {
    const next = request.strategies.includes(name)
      ? request.strategies.filter((s) => s !== name)
      : [...request.strategies, name];
    onChange({ ...request, strategies: next });
  };

  return (
    <Card className="gap-5 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">
          Hunt with these strategies
        </h2>
        <p className="text-xs text-muted-foreground">
          Pick any combination — including strategies you keep switched off. The
          scan checks every pair on every exchange and ranks what it finds.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {BUILT_IN_STRATEGIES.map((strategy) => {
          const checked = request.strategies.includes(strategy.name);
          return (
            <label
              key={strategy.id}
              htmlFor={`scan-${strategy.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                checked
                  ? "border-primary/40 bg-primary/[0.04]"
                  : "hover:border-primary/25",
              )}
            >
              <Checkbox
                id={`scan-${strategy.id}`}
                checked={checked}
                onCheckedChange={() => toggle(strategy.name)}
                className="mt-0.5"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">
                  {strategy.name}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {strategy.summary}
                </span>
              </span>
            </label>
          );
        })}
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
            <SelectTrigger id="scan-market" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Spot &amp; Perpetuals</SelectItem>
              <SelectItem value="SPOT">Spot only</SelectItem>
              <SelectItem value="PERPETUAL">Perpetuals only</SelectItem>
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
            <SelectTrigger id="scan-exchange" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All exchanges</SelectItem>
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
          disabled={scanning || request.strategies.length === 0}
          className="ml-auto min-w-40"
          size="lg"
        >
          <Radar className={cn(scanning && "animate-spin")} />
          {scanning ? "Scanning…" : "Scan the market"}
        </Button>
      </div>

      {request.strategies.length === 0 && (
        <p className="text-xs text-warning">
          Pick at least one strategy to scan with.
        </p>
      )}
    </Card>
  );
}
