import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, TrendingUp, RefreshCw } from "lucide-react";
import type { TradingPreferences } from "../types";

export function TradingPreferencesView({ prefs }: { prefs: TradingPreferences }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Trading Preferences</h2>
        <p className="text-muted-foreground text-sm mt-1">Configure default parameters for the backtesting and paper trading environments.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Default Environment</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Exchange</label>
            <Select defaultValue={prefs.defaultExchange.toLowerCase()}>
              <SelectTrigger>
                <SelectValue placeholder="Select exchange" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="binance">Binance</SelectItem>
                <SelectItem value="bybit">Bybit</SelectItem>
                <SelectItem value="kraken">Kraken</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Market / Pair</label>
            <Input defaultValue={prefs.defaultMarket} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Timeframe</label>
            <Select defaultValue={prefs.defaultTimeframe.toLowerCase()}>
              <SelectTrigger>
                <SelectValue placeholder="Select timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15 Minutes</SelectItem>
                <SelectItem value="1h">1 Hour</SelectItem>
                <SelectItem value="4h">4 Hours</SelectItem>
                <SelectItem value="1d">1 Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Preferred Market Regime</label>
            <Select defaultValue="trending_volatile">
              <SelectTrigger>
                <SelectValue placeholder="Select regime" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trending_volatile">Trending Volatile</SelectItem>
                <SelectItem value="ranging">Ranging / Choppy</SelectItem>
                <SelectItem value="trending_smooth">Trending Smooth</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Risk & Sizing</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Risk per Trade (%)</label>
            <div className="relative">
              <Input type="number" step="0.1" defaultValue={prefs.defaultRiskPct} className="pr-8" />
              <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">The risk engine will block signals exceeding this limit.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Position Size ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <Input type="number" defaultValue={prefs.defaultPositionSize} className="pl-7" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Workspace Behavior</h3>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="size-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-sm">Auto-Refresh Market Data</h4>
                <p className="text-xs text-muted-foreground">Automatically fetch new candle data in the background.</p>
              </div>
            </div>
            <Switch defaultChecked={prefs.autoRefresh} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="size-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-sm">Auto-Save Layouts</h4>
                <p className="text-xs text-muted-foreground">Preserve chart drawings and table columns automatically.</p>
              </div>
            </div>
            <Switch defaultChecked={prefs.autoSaveLayout} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline">Discard</Button>
        <Button>Save Preferences</Button>
      </div>
    </div>
  );
}
