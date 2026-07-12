import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Moon, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function QuietHours() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 text-primary rounded-md">
          <Moon className="size-5" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Quiet Hours</h3>
          <p className="text-sm text-muted-foreground">Mute non-critical notifications during these times.</p>
        </div>
        <div className="ml-auto">
          <Switch defaultChecked={false} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Input type="time" defaultValue="22:00" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Time</label>
              <Input type="time" defaultValue="06:00" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Timezone</label>
            <Select defaultValue="utc">
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
                <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
                <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Weekend Rules</label>
            <Select defaultValue="always">
              <SelectTrigger>
                <SelectValue placeholder="Weekend behavior" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Always Quiet (All weekend)</SelectItem>
                <SelectItem value="same">Same as Weekdays</SelectItem>
                <SelectItem value="never">Never Quiet (Disable on weekends)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Card className="p-4 bg-muted/50 border-destructive/20 mt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold">Emergency Override</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Always deliver CRITICAL priority alerts (like Stop Loss triggers) even during Quiet Hours.
                  </p>
                </div>
              </div>
              <Switch defaultChecked={true} />
            </div>
          </Card>
        </div>
      </div>
    </Card>
  );
}
