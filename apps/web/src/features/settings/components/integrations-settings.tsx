import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Integration } from "../types";

export function IntegrationsSettingsView({ integrations }: { integrations: Integration[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
        <p className="text-muted-foreground text-sm mt-1">Connect Aegis Signal with your favorite third-party services.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.id} className={`p-5 flex flex-col gap-3 ${integration.status === "coming_soon" ? "opacity-60 grayscale" : ""}`}>
            <div className="flex justify-between items-start">
              <h3 className="font-semibold">{integration.service}</h3>
              {integration.status === "coming_soon" ? (
                <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
              ) : (
                <Badge variant={integration.status === "active" ? "default" : "secondary"} className="text-[10px]">
                  {integration.status}
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              {integration.description}
            </p>

            <div className="pt-3 border-t mt-2">
              <Button 
                variant={integration.status === "active" ? "outline" : "secondary"} 
                size="sm" 
                className="w-full text-xs"
                disabled={integration.status === "coming_soon"}
              >
                {integration.status === "active" ? "Configure" : "Enable"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
