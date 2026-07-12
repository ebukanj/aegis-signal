import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, HardHat, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function MaintenanceMode() {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Maintenance Mode</h2>
        <p className="text-muted-foreground text-sm mt-1">Platform kill-switches and scheduled downtime controls.</p>
      </div>

      <Card className="border-warning/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-warning/50" />
        <div className="p-6 space-y-6">
          <div className="flex gap-3">
            <HardHat className="size-6 text-warning shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-warning">Global Maintenance Toggle</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Activating this will immediately force all non-admin users off the platform and display the maintenance screen.
                Trading strategies will continue to run in the background unless explicitly stopped.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-background/50">
            <div>
              <h4 className="font-medium">Enable Maintenance Mode</h4>
              <p className="text-xs text-muted-foreground mt-1">Status: Currently Inactive</p>
            </div>
            <Switch checked={false} />
          </div>
        </div>
      </Card>

      <Card className="border-destructive/50 relative overflow-hidden mt-8">
        <div className="absolute top-0 left-0 w-1 h-full bg-destructive/50" />
        <div className="p-6 space-y-6">
          <div className="flex gap-3">
            <ShieldAlert className="size-6 text-destructive shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-destructive">Emergency Kill Switch</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Catastrophic response controls. Only use when the platform is actively compromised or causing financial harm.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div>
                <h4 className="font-medium text-destructive">Halt All Strategies</h4>
                <p className="text-xs text-muted-foreground mt-1">Immediately force-stops all running algorithmic strategies.</p>
              </div>
              <Button variant="destructive">Halt Strategies</Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div>
                <h4 className="font-medium text-destructive">Sever Exchange Connections</h4>
                <p className="text-xs text-muted-foreground mt-1">Drops all CCXT and WebSocket connections to external exchanges.</p>
              </div>
              <Button variant="destructive">Disconnect Exchanges</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
