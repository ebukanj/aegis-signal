import { Card } from "@/components/ui/card";
import { HardHat, ShieldAlert, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { MaintenanceStateDto } from "@aegis/contracts";

/**
 * Maintenance mode — LIVE. The toggle drives the real backend guard: when on, the
 * API turns every public request away with a 503 and this message, while health,
 * metrics and the admin console stay reachable so an operator can climb back out.
 *
 * The "emergency" levers are the real feature-flag kill switches, reached from the
 * Feature Flags tab — this panel points there rather than showing a second, fake set
 * of buttons that do nothing.
 */
export function MaintenanceMode({
  state,
  onToggle,
  pending,
}: {
  state?: MaintenanceStateDto;
  onToggle?: (enabled: boolean) => void;
  pending?: boolean;
}) {
  const enabled = state?.enabled ?? false;

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
                Activating this immediately turns all public API requests away with a 503 maintenance response.
                Health checks, metrics and this admin console stay reachable. Background workers keep running unless
                you stop them.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-background/50">
            <div>
              <h4 className="font-medium">Enable Maintenance Mode</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Status: {enabled ? "Currently ACTIVE" : "Currently Inactive"}
                {enabled && state?.readOnly ? " (read-only)" : ""}
              </p>
            </div>
            <Switch
              checked={enabled}
              disabled={!onToggle || pending}
              onCheckedChange={(checked) => onToggle?.(checked)}
            />
          </div>

          {enabled && state?.message ? (
            <p className="text-xs text-warning/90 border-l-2 border-warning/50 pl-3">
              Shown to users: “{state.message}”
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="border-destructive/50 relative overflow-hidden mt-8">
        <div className="absolute top-0 left-0 w-1 h-full bg-destructive/50" />
        <div className="p-6 space-y-4">
          <div className="flex gap-3">
            <ShieldAlert className="size-6 text-destructive shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-destructive">Emergency Kill Switches</h3>
              <p className="text-sm text-muted-foreground mt-1">
                The real per-subsystem kill switches — halt signal publication, stop notification delivery, pause
                collection or settlement — are the runtime feature flags. Each takes effect on the next request and is
                audited.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-4 border border-destructive/20 rounded-lg bg-destructive/5 text-sm">
            <Zap className="size-4 text-destructive shrink-0" />
            <span className="text-muted-foreground">
              Open the <span className="font-medium text-foreground">Feature Flags</span> tab to flip a kill switch.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
