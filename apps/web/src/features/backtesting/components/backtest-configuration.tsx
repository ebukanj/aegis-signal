"use client";

import { Play, Settings2, RefreshCcw, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBacktestingStore } from "@/stores/backtesting-store";
import { useBacktestExecution } from "@/features/backtesting/hooks/use-backtesting";
import { STRATEGY_ROSTER } from "@/constants/strategies";
import type { MarketRegime, Timeframe } from "@/types/domain";
import type { BacktestConfig } from "@/features/backtesting/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EXCHANGES = ["Binance", "Bybit", "OKX", "Coinbase", "Kraken"];
const TIMEFRAMES: { value: Timeframe | "MIXED"; label: string }[] = [
  { value: "MIXED", label: "Mixed / Adaptive" },
  { value: "15m", label: "15 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hours" },
  { value: "1d", label: "1 Day" },
];

/**
 * The premium backtesting configuration panel.
 * Contains dropdowns, sliders, inputs, quick presets, and the primary "Run" CTA.
 */
export function BacktestConfiguration() {
  const config = useBacktestingStore((s) => s.config);
  const setConfig = useBacktestingStore((s) => s.setConfig);
  const resetConfig = useBacktestingStore((s) => s.resetConfig);
  const simulation = useBacktestingStore((s) => s.simulation);
  const { runBacktest } = useBacktestExecution();

  const isRunning = simulation.phase !== "IDLE" && simulation.phase !== "COMPLETED" && simulation.phase !== "FAILED";

  const handleRun = () => {
    if (new Date(config.startDate) >= new Date(config.endDate)) {
      toast.error("Invalid Date Range", { description: "Start date must be before end date." });
      return;
    }
    runBacktest();
  };

  const applyPreset = (preset: "30D" | "90D" | "6M" | "1Y" | "BULL" | "BEAR") => {
    const today = new Date();
    const start = new Date();
    
    switch (preset) {
      case "30D": start.setDate(today.getDate() - 30); break;
      case "90D": start.setDate(today.getDate() - 90); break;
      case "6M": start.setMonth(today.getMonth() - 6); break;
      case "1Y": start.setFullYear(today.getFullYear() - 1); break;
      case "BULL": 
        start.setFullYear(2023, 0, 1); 
        today.setFullYear(2023, 11, 31);
        break;
      case "BEAR":
        start.setFullYear(2022, 0, 1);
        today.setFullYear(2022, 11, 31);
        break;
    }

    setConfig("startDate", start.toISOString().split("T")[0]);
    setConfig("endDate", today.toISOString().split("T")[0]);
    toast.success(`Applied ${preset} preset dates.`);
  };

  return (
    <Card className="flex flex-col border-border/50 bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-medium">
          <Settings2 className="size-4 text-muted-foreground" />
          Configuration Parameters
        </div>
        <Button variant="ghost" size="sm" onClick={resetConfig} disabled={isRunning} className="h-7 text-xs">
          <RefreshCcw className="mr-1.5 size-3" />
          Reset Default
        </Button>
      </div>

      <div className="grid gap-6 p-4 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Core Settings */}
        <div className="space-y-4">
          <span className="label-caps block">Core Parameters</span>
          
          <div className="space-y-1.5">
            <Label htmlFor="strategy" className="text-xs">Strategy</Label>
            <Select disabled={isRunning} value={config.strategy} onValueChange={(v) => setConfig("strategy", v)}>
              <SelectTrigger id="strategy" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Strategies (Portfolio)</SelectItem>
                {STRATEGY_ROSTER.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exchange" className="text-xs">Exchange</Label>
            <Select disabled={isRunning} value={config.exchange} onValueChange={(v) => setConfig("exchange", v)}>
              <SelectTrigger id="exchange" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Aggregated Liquidity</SelectItem>
                {EXCHANGES.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timeframe" className="text-xs">Timeframe</Label>
            <Select disabled={isRunning} value={config.timeframe} onValueChange={(v: BacktestConfig["timeframe"]) => setConfig("timeframe", v)}>
              <SelectTrigger id="timeframe" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <span className="label-caps block">Historical Timeline</span>
          
          <div className="space-y-1.5">
            <Label htmlFor="startDate" className="text-xs">Start Date</Label>
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1.5 size-4 text-muted-foreground" />
              <Input 
                id="startDate" 
                type="date" 
                disabled={isRunning} 
                value={config.startDate} 
                onChange={(e) => setConfig("startDate", e.target.value)} 
                className="h-8 pl-9 text-xs" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endDate" className="text-xs">End Date</Label>
            <div className="relative">
              <CalendarDays className="absolute left-2.5 top-1.5 size-4 text-muted-foreground" />
              <Input 
                id="endDate" 
                type="date" 
                disabled={isRunning} 
                value={config.endDate} 
                onChange={(e) => setConfig("endDate", e.target.value)} 
                className="h-8 pl-9 text-xs" 
              />
            </div>
          </div>

          <div className="pt-1">
            <Label className="mb-2 block text-[10px] uppercase text-muted-foreground">Quick Presets</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["30D", "90D", "6M", "1Y", "BULL", "BEAR"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  disabled={isRunning}
                  className="rounded border border-border bg-muted/30 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Capital & Risk */}
        <div className="space-y-4">
          <span className="label-caps block">Capital & Risk</span>
          
          <div className="space-y-1.5">
            <Label htmlFor="initialCapital" className="text-xs">Initial Capital ($)</Label>
            <Input 
              id="initialCapital" 
              type="number" 
              min={100} 
              step={100} 
              disabled={isRunning} 
              value={config.initialCapital} 
              onChange={(e) => setConfig("initialCapital", parseFloat(e.target.value))} 
              className="h-8 font-numeric text-xs" 
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="positionSizing" className="text-xs">Position Sizing</Label>
            <Select disabled={isRunning} value={config.positionSizing} onValueChange={(v: BacktestConfig["positionSizing"]) => setConfig("positionSizing", v)}>
              <SelectTrigger id="positionSizing" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPOUNDING">Compounding (% of Equity)</SelectItem>
                <SelectItem value="FIXED_RISK">Fixed Risk (% of Initial)</SelectItem>
                <SelectItem value="FIXED_SIZE">Fixed Size ($ Amount)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex justify-between">
              <Label className="text-xs">Risk Per Trade</Label>
              <span className="font-numeric text-xs text-muted-foreground">{config.riskPerTrade.toFixed(1)}%</span>
            </div>
            <Slider
              disabled={isRunning}
              min={0.1}
              max={5.0}
              step={0.1}
              value={[config.riskPerTrade]}
              onValueChange={([v]) => setConfig("riskPerTrade", v)}
            />
          </div>
        </div>

        {/* Friction & CTA */}
        <div className="flex flex-col space-y-4">
          <span className="label-caps block">Market Friction</span>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="commission" className="text-xs">Commission (%)</Label>
              <Input 
                id="commission" 
                type="number" 
                min={0} 
                step={0.01} 
                disabled={isRunning} 
                value={config.commissionPercent} 
                onChange={(e) => setConfig("commissionPercent", parseFloat(e.target.value))} 
                className="h-8 font-numeric text-xs" 
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slippage" className="text-xs">Slippage (%)</Label>
              <Input 
                id="slippage" 
                type="number" 
                min={0} 
                step={0.01} 
                disabled={isRunning} 
                value={config.slippagePercent} 
                onChange={(e) => setConfig("slippagePercent", parseFloat(e.target.value))} 
                className="h-8 font-numeric text-xs" 
              />
            </div>
          </div>

          <div className="mt-auto pt-6">
            <Button 
              onClick={handleRun} 
              disabled={isRunning} 
              className={cn("h-12 w-full text-base font-semibold shadow-lg transition-all", isRunning && "opacity-80")}
            >
              {isRunning ? (
                <>
                  <RefreshCcw className="mr-2 size-4 animate-spin" />
                  Running Simulation...
                </>
              ) : (
                <>
                  <Play className="mr-2 size-4 fill-current" />
                  Run Backtest
                </>
              )}
            </Button>
          </div>
        </div>

      </div>
    </Card>
  );
}
