import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Settings } from "lucide-react";

export function PaperTradingHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paper Trading</h1>
        <p className="text-muted-foreground">
          Simulated execution and portfolio management environment.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm">
          <RefreshCw className="mr-2 size-4" />
          Reset Account
        </Button>
        <Button variant="outline" size="sm">
          <Download className="mr-2 size-4" />
          Export
        </Button>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 size-4" />
          Settings
        </Button>
      </div>
    </div>
  );
}
