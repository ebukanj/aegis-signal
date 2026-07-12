import { BellRing, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotificationHeader() {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-6 border-b">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BellRing className="size-8 text-primary" />
          Notification Center
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage how, when, and where you receive trading intelligence.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline">
          <Settings className="size-4 mr-2" /> Global Settings
        </Button>
        <Button>Save Preferences</Button>
      </div>
    </div>
  );
}
