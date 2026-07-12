"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { REGIME_META } from "@/constants/domain";
import type {
  StrategyConfig,
  StrategyProfile,
} from "@/features/strategies/types";
import type { MarketRegime, Timeframe } from "@/types/domain";
import { cn } from "@/lib/utils";

const ALL_TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];
const ALL_EXCHANGES = ["Binance", "Bybit", "OKX", "Bitget", "KuCoin"];

/**
 * Strategy configuration — UI only. Saving posts to the Administration API
 * later (Configuration over Code, Founding Principle 6); until then the form
 * is fully interactive but persists nothing.
 */
export function StrategyConfiguration({
  strategy,
  className,
}: {
  strategy: StrategyProfile;
  className?: string;
}) {
  const [config, setConfig] = useState<StrategyConfig>(strategy.defaultConfig);
  useEffect(() => setConfig(strategy.defaultConfig), [strategy]);

  const set = <K extends keyof StrategyConfig>(
    key: K,
    value: StrategyConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  const toggleInList = (key: "allowedExchanges", value: string) =>
    set(
      key,
      config[key].includes(value)
        ? config[key].filter((v) => v !== value)
        : [...config[key], value],
    );

  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold tracking-tight">Configuration</h3>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="strategy-enabled" className="text-xs text-muted-foreground">
            {config.enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id="strategy-enabled"
            checked={config.enabled}
            onCheckedChange={(checked) => set("enabled", checked)}
            aria-label={`${strategy.name} enabled`}
          />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Risk multiplier */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="risk-multiplier">Risk Multiplier</Label>
            <span className="font-numeric text-sm">{config.riskMultiplier.toFixed(2)}×</span>
          </div>
          <Slider
            id="risk-multiplier"
            value={[config.riskMultiplier]}
            onValueChange={([v]) => set("riskMultiplier", v)}
            min={0.25}
            max={2}
            step={0.25}
            aria-label="Risk multiplier"
          />
          <p className="text-xs text-muted-foreground">
            Scales the module&apos;s base risk per trade. 1.00× = spec default.
          </p>
        </div>

        {/* Confidence threshold */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="confidence-threshold">Confidence Threshold</Label>
            <span className="font-numeric text-sm">{config.confidenceThreshold}</span>
          </div>
          <Slider
            id="confidence-threshold"
            value={[config.confidenceThreshold]}
            onValueChange={([v]) => set("confidenceThreshold", v)}
            min={60}
            max={95}
            step={5}
            aria-label="Minimum confidence to alert"
          />
          <p className="text-xs text-muted-foreground">
            Signals below this score are logged as watchlist, never alerted.
          </p>
        </div>

        {/* Max concurrent + priority */}
        <div className="space-y-2">
          <Label>Max Concurrent Signals</Label>
          <Select
            value={String(config.maxConcurrentSignals)}
            onValueChange={(v) => set("maxConcurrentSignals", Number(v))}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Max concurrent signals">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 5, 8].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Strategy Priority</Label>
          <Select
            value={String(config.priority)}
            onValueChange={(v) => set("priority", Number(v))}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Strategy priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} {n === 1 ? "(highest)" : n === 10 ? "(lowest)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Allowed exchanges */}
      <div className="space-y-2">
        <p className="label-caps">Allowed Exchanges</p>
        <div className="flex flex-wrap gap-3">
          {ALL_EXCHANGES.map((exchange) => (
            <label key={exchange} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={config.allowedExchanges.includes(exchange)}
                onCheckedChange={() => toggleInList("allowedExchanges", exchange)}
                aria-label={`Allow ${exchange}`}
              />
              {exchange}
            </label>
          ))}
        </div>
      </div>

      {/* Allowed timeframes */}
      <div className="space-y-2">
        <p className="label-caps">Allowed Timeframes</p>
        <div className="flex flex-wrap gap-3">
          {ALL_TIMEFRAMES.map((tf) => (
            <label key={tf} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={config.allowedTimeframes.includes(tf)}
                onCheckedChange={() =>
                  set(
                    "allowedTimeframes",
                    config.allowedTimeframes.includes(tf)
                      ? config.allowedTimeframes.filter((t) => t !== tf)
                      : [...config.allowedTimeframes, tf],
                  )
                }
                aria-label={`Allow ${tf}`}
              />
              <span className="font-numeric">{tf}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Preferred regimes */}
      <div className="space-y-2">
        <p className="label-caps">Preferred Market Regimes</p>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(REGIME_META) as MarketRegime[]).map((regime) => (
            <label key={regime} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={config.preferredRegimes.includes(regime)}
                onCheckedChange={() =>
                  set(
                    "preferredRegimes",
                    config.preferredRegimes.includes(regime)
                      ? config.preferredRegimes.filter((r) => r !== regime)
                      : [...config.preferredRegimes, regime],
                  )
                }
                aria-label={`Prefer ${REGIME_META[regime].label}`}
              />
              {REGIME_META[regime].label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.notifyOnSignal}
            onCheckedChange={(checked) => set("notifyOnSignal", checked)}
            aria-label="Notify on signal"
          />
          Notify on signal
        </label>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfig(strategy.defaultConfig);
              toast.info("Configuration reset to spec defaults.");
            }}
          >
            <RotateCcw /> Reset
          </Button>
          <Button
            size="sm"
            onClick={() =>
              toast.info(
                "Saving arrives with the Administration API — configuration is not persisted yet.",
              )
            }
          >
            <Save /> Save configuration
          </Button>
        </div>
      </div>
    </Card>
  );
}
