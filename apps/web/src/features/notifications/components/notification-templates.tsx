import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Info } from "lucide-react";

export function NotificationTemplates() {
  const templates = [
    {
      id: "tpl_new_signal",
      name: "New Signal Alert",
      description: "Fired when a new trade setup is identified.",
      format: `🟢 {{direction}}: {{asset}}
Strategy: {{strategy.name}}
Confidence: {{confidence}}%
Entry: {{entryPrice}}

Targets:
{{#each targets}}
🎯 TP{{index}}: {{price}} (+{{pct}}%)
{{/each}}
🛑 SL: {{stopLoss}} (-{{slPct}}%)`
    },
    {
      id: "tpl_sl_hit",
      name: "Stop Loss Triggered",
      description: "Fired when an open position is stopped out.",
      format: `🚨 STOP LOSS TRIGGERED
Asset: {{asset}}
Direction: {{direction}}
Exit Price: {{exitPrice}}

Realized PnL: {{pnlDollar}} ({{pnlPct}}%)`
    },
    {
      id: "tpl_risk_warning",
      name: "Risk Warning",
      description: "Fired when portfolio parameters are breached.",
      format: `⚠️ RISK LIMIT EXCEEDED
Metric: {{riskMetric.name}}
Current: {{riskMetric.currentValue}}
Threshold: {{riskMetric.threshold}}

Action Required: Review open positions to reduce exposure.`
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-primary/10 text-primary p-4 rounded-lg flex gap-3 text-sm">
        <Info className="size-5 shrink-0" />
        <p>Templates utilize Handlebars `{"{{"}variable{"}}"} ` syntax. Editing templates is currently disabled in this environment.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {templates.map(tpl => (
          <Card key={tpl.id} className="p-5 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{tpl.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
              </div>
              <Badge variant="outline">System Template</Badge>
            </div>
            
            <div className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Message Body (Markdown Supported)</label>
                <Textarea 
                  defaultValue={tpl.format} 
                  className="font-mono text-xs min-h-[180px] bg-muted/50" 
                  disabled
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
