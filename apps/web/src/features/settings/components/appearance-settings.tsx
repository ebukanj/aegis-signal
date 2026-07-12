import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Moon, Sun, LayoutTemplate, Activity } from "lucide-react";
import type { AppearanceSettings } from "../types";

export function AppearanceSettingsView({ settings }: { settings: AppearanceSettings }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Appearance</h2>
        <p className="text-muted-foreground text-sm mt-1">Customize the look and feel of your workspace.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Theme Preferences</h3>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Button variant="outline" className={`h-24 flex-col gap-2 ${settings.theme === "light" ? "border-primary bg-primary/5" : ""}`}>
            <Sun className="size-6" />
            <span>Light</span>
          </Button>
          <Button variant="outline" className={`h-24 flex-col gap-2 ${settings.theme === "dark" ? "border-primary bg-primary/5" : ""}`}>
            <Moon className="size-6" />
            <span>Dark</span>
          </Button>
          <Button variant="outline" className={`h-24 flex-col gap-2 ${settings.theme === "system" ? "border-primary bg-primary/5" : ""}`}>
            <Monitor className="size-6" />
            <span>System</span>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Accent Color</label>
            <div className="flex gap-3">
              {['blue', 'purple', 'emerald', 'rose', 'amber'].map(color => (
                <div 
                  key={color} 
                  className={`size-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background ${settings.accentColor === color ? "ring-primary" : "ring-transparent"} ${
                    color === 'blue' ? 'bg-blue-500' : 
                    color === 'purple' ? 'bg-purple-500' :
                    color === 'emerald' ? 'bg-emerald-500' :
                    color === 'rose' ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Chart Theme</label>
            <Select defaultValue={settings.chartTheme}>
              <SelectTrigger>
                <SelectValue placeholder="Select chart theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modern">Modern (Default)</SelectItem>
                <SelectItem value="classic">Classic Finance</SelectItem>
                <SelectItem value="accessible">High Contrast</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Interface Density</h3>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LayoutTemplate className="size-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-sm">Compact Mode</h4>
                <p className="text-xs text-muted-foreground">Reduce padding to fit more data on screen.</p>
              </div>
            </div>
            <Switch defaultChecked={settings.compactMode === "compact"} />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="size-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-sm">UI Animations</h4>
                <p className="text-xs text-muted-foreground">Enable micro-interactions and page transitions.</p>
              </div>
            </div>
            <Switch defaultChecked={settings.animationsEnabled} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline">Reset Defaults</Button>
        <Button>Save Changes</Button>
      </div>
    </div>
  );
}
