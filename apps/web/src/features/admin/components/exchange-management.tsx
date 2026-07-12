import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Clock, Activity, PowerOff } from "lucide-react";
import type { AdminExchange } from "../types";

export function ExchangeManagement({ exchanges }: { exchanges: AdminExchange[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Exchange Connectivity</h2>
        <p className="text-muted-foreground text-sm mt-1">Monitor CCXT integrations and WebSocket health.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {exchanges.map(exchange => (
          <Card key={exchange.id} className="p-5 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="size-5 text-primary" />
                <h3 className="font-semibold text-lg">{exchange.name}</h3>
              </div>
              <Badge 
                variant="outline" 
                className={`border-transparent text-[10px] uppercase ${
                  exchange.status === "connected" ? "bg-success/10 text-success" :
                  exchange.status === "degraded" ? "bg-warning/10 text-warning" :
                  "bg-destructive/10 text-destructive"
                }`}
              >
                {exchange.status}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 my-2 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs flex items-center gap-1">
                  <Clock className="size-3" /> Latency
                </div>
                <div className={`font-mono ${exchange.latencyMs > 200 ? "text-warning" : "text-foreground"}`}>
                  {exchange.latencyMs > 0 ? `${exchange.latencyMs}ms` : "-"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs flex items-center gap-1">
                  <Activity className="size-3" /> Markets
                </div>
                <div className="font-numeric">
                  {exchange.marketCount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mt-auto">
              Last synced: {Math.floor(Date.now() / 1000) - exchange.lastSync}s ago
            </div>

            <div className="pt-4 border-t flex gap-2">
              <Button variant="outline" size="sm" className="w-full flex-1">Reconnect</Button>
              <Button variant="outline" size="icon" className="w-9 h-9 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <PowerOff className="size-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
