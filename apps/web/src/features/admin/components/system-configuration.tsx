import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings2, Save, RotateCcw } from "lucide-react";

export function SystemConfiguration() {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">System Configuration</h2>
          <p className="text-muted-foreground text-sm mt-1">Global platform parameters and environment variables.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <RotateCcw className="size-4" /> Discard
          </Button>
          <Button className="gap-2">
            <Save className="size-4" /> Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6 border-b pb-4">
            <Settings2 className="size-5 text-primary" />
            <h3 className="font-semibold">Scanner Configuration</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Default API Rate Limit (ms)</label>
              <Input defaultValue="1200" />
              <p className="text-xs text-muted-foreground">Base delay between exchange API calls.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max WebSocket Reconnects</label>
              <Input defaultValue="5" />
              <p className="text-xs text-muted-foreground">Maximum attempts before marking exchange offline.</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6 border-b pb-4">
            <Settings2 className="size-5 text-primary" />
            <h3 className="font-semibold">Security Policies</h3>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">Require 2FA for Administrators</h4>
                <p className="text-xs text-muted-foreground mt-1">Force all admin roles to use TOTP.</p>
              </div>
              <Switch defaultChecked={true} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">Strict IP Whitelisting</h4>
                <p className="text-xs text-muted-foreground mt-1">Only allow admin access from corporate VPNs.</p>
              </div>
              <Switch defaultChecked={false} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Session Timeout (Minutes)</label>
              <Input defaultValue="60" className="max-w-xs" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
