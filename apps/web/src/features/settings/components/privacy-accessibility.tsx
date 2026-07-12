import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Accessibility, Download, ExternalLink } from "lucide-react";
import type { PrivacySettings, AccessibilitySettings } from "../types";

export function PrivacyAccessibilityView({ 
  privacy, 
  accessibility 
}: { 
  privacy: PrivacySettings; 
  accessibility: AccessibilitySettings; 
}) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Data & Accessibility</h2>
        <p className="text-muted-foreground text-sm mt-1">Control your privacy settings and customize accessibility features.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Eye className="size-5 text-primary" />
              <h3 className="font-semibold text-sm">Privacy & Data</h3>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Data Collection</h4>
                  <p className="text-xs text-muted-foreground mt-1">Allow Aegis to collect anonymous usage data to improve the platform.</p>
                </div>
                <Switch defaultChecked={privacy.dataCollection} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Performance Analytics</h4>
                  <p className="text-xs text-muted-foreground mt-1">Share crash reports and latency metrics.</p>
                </div>
                <Switch defaultChecked={privacy.analyticsEnabled} />
              </div>
              <div className="pt-2">
                <label className="text-sm font-medium">Cookie Preferences</label>
                <Select defaultValue={privacy.cookiePreferences}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essential">Essential Only</SelectItem>
                    <SelectItem value="all">Accept All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t space-y-3">
              <Button variant="outline" className="w-full justify-between" size="sm">
                <span>Download My Data (JSON)</span>
                <Download className="size-4" />
              </Button>
              <div className="flex gap-4 text-xs">
                <a href="#" className="text-primary hover:underline flex items-center gap-1">
                  Privacy Policy <ExternalLink className="size-3" />
                </a>
                <a href="#" className="text-primary hover:underline flex items-center gap-1">
                  Terms of Service <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Accessibility className="size-5 text-primary" />
              <h3 className="font-semibold text-sm">Accessibility</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Font Scaling</label>
                <Select defaultValue={accessibility.fontScaling}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium (Default)</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                    <SelectItem value="x-large">Extra Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">High Contrast Mode</h4>
                  <p className="text-xs text-muted-foreground mt-1">Increase contrast between background and text.</p>
                </div>
                <Switch defaultChecked={accessibility.highContrast} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Keyboard Navigation</h4>
                  <p className="text-xs text-muted-foreground mt-1">Show visible focus indicators always.</p>
                </div>
                <Switch defaultChecked={accessibility.keyboardNavigation} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Screen Reader Optimization</h4>
                  <p className="text-xs text-muted-foreground mt-1">Optimize ARIA labels for screen readers.</p>
                </div>
                <Switch defaultChecked={accessibility.screenReaderOptimization} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Color Blind Mode</label>
                <Select defaultValue={accessibility.colorBlindMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="protanopia">Protanopia (Red-Blind)</SelectItem>
                    <SelectItem value="deuteranopia">Deuteranopia (Green-Blind)</SelectItem>
                    <SelectItem value="tritanopia">Tritanopia (Blue-Blind)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
