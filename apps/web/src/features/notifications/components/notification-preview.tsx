"use client";

import { useNotificationStore } from "../stores/notification-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Mail, Globe } from "lucide-react";

export function NotificationPreview() {
  const { previewChannel, setPreviewChannel } = useNotificationStore();

  const renderTelegramPreview = () => (
    <div className="bg-[#18222d] text-white p-4 rounded-xl max-w-sm mx-auto shadow-lg text-sm font-sans">
      <div className="text-[#59bdf4] font-semibold mb-1">Aegis Signal Bot</div>
      <div className="font-mono text-xs text-green-400 mb-2">🟢 LONG: BTC/USDT</div>
      <p className="mb-2 whitespace-pre-wrap">
        Strategy: Breakout{"\n"}
        Confidence: 94%{"\n"}
        Entry: $64,250.00
      </p>
      <p className="text-gray-400 text-xs mb-1">Targets:</p>
      <ul className="text-xs space-y-1 mb-2">
        <li>🎯 TP1: $65,500 (+1.9%)</li>
        <li>🎯 TP2: $66,200 (+3.0%)</li>
        <li>🛑 SL: $63,100 (-1.8%)</li>
      </ul>
      <div className="text-right text-[10px] text-gray-500">14:32</div>
    </div>
  );

  const renderEmailPreview = () => (
    <div className="bg-background border rounded-lg p-6 max-w-md mx-auto text-sm shadow-sm">
      <div className="border-b pb-4 mb-4">
        <h1 className="text-xl font-bold tracking-tight">AEGIS SIGNAL</h1>
        <p className="text-muted-foreground text-xs mt-1">Institutional Market Intelligence</p>
      </div>
      <h2 className="text-lg font-semibold text-destructive mb-2">CRITICAL: Stop Loss Triggered</h2>
      <p className="mb-4">Your open position has hit its protective stop loss.</p>
      <div className="bg-muted p-4 rounded-md font-mono text-xs space-y-2 mb-4">
        <div>Asset: ETH/USDT</div>
        <div>Direction: SHORT</div>
        <div>Exit Price: $3,450.00</div>
        <div className="text-destructive font-bold">Realized PnL: -$124.50 (-1.2%)</div>
      </div>
      <Button size="sm" className="w-full">View Portfolio</Button>
    </div>
  );

  const renderBrowserPreview = () => (
    <div className="bg-popover border text-popover-foreground p-4 rounded-lg max-w-sm mx-auto shadow-xl flex gap-3 items-start">
      <div className="bg-primary/10 p-2 rounded-full shrink-0">
        <Globe className="size-4 text-primary" />
      </div>
      <div>
        <h4 className="font-semibold text-sm">Risk Warning</h4>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Portfolio active risk has exceeded 5%. Consider sizing down current positions.
        </p>
      </div>
    </div>
  );

  return (
    <Card className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Live Preview</h3>
        <div className="flex gap-1 bg-muted p-1 rounded-md">
          <Button 
            variant={previewChannel === "TELEGRAM" ? "secondary" : "ghost"} 
            size="sm" 
            className="px-2 h-7"
            onClick={() => setPreviewChannel("TELEGRAM")}
          >
            <Send className="size-3 mr-1" /> TG
          </Button>
          <Button 
            variant={previewChannel === "EMAIL" ? "secondary" : "ghost"} 
            size="sm" 
            className="px-2 h-7"
            onClick={() => setPreviewChannel("EMAIL")}
          >
            <Mail className="size-3 mr-1" /> Email
          </Button>
          <Button 
            variant={previewChannel === "BROWSER" ? "secondary" : "ghost"} 
            size="sm" 
            className="px-2 h-7"
            onClick={() => setPreviewChannel("BROWSER")}
          >
            <Globe className="size-3 mr-1" /> Web
          </Button>
        </div>
      </div>
      <div className="flex-1 bg-muted/30 p-8 flex items-center justify-center relative overflow-hidden min-h-[400px]">
        {/* Decorative background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />
        
        <div className="relative z-10 w-full animate-in fade-in zoom-in-95 duration-300" key={previewChannel}>
          {previewChannel === "TELEGRAM" && renderTelegramPreview()}
          {previewChannel === "EMAIL" && renderEmailPreview()}
          {previewChannel === "BROWSER" && renderBrowserPreview()}
          {(previewChannel !== "TELEGRAM" && previewChannel !== "EMAIL" && previewChannel !== "BROWSER") && (
            <div className="text-center text-muted-foreground text-sm">
              Preview not available for {previewChannel}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
