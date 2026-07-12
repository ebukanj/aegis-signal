import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, UserCircle, LogOut } from "lucide-react";
import type { AccountSettings } from "../types";

export function AccountSettingsView({ account }: { account: AccountSettings }) {
  const storagePct = (account.storageUsedBytes / account.storageTotalBytes) * 100;
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Account Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage your subscription, storage, and account lifecycle.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-sm">Subscription Plan</h3>
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <UserCircle className="size-8 text-primary" />
              <div>
                <div className="font-bold">{account.subscriptionPlan}</div>
                <div className="text-xs text-muted-foreground">Billed annually. Next billing date: Jan 1, 2027.</div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button size="sm" className="w-full">Manage Subscription</Button>
            <Button size="sm" variant="outline" className="w-full">View Invoices</Button>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-sm">Workspace Storage</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{formatBytes(account.storageUsedBytes)} Used</span>
              <span className="text-muted-foreground">{formatBytes(account.storageTotalBytes)} Total</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div 
                className="h-full bg-primary transition-all duration-500" 
                style={{ width: `${storagePct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground pt-2">Storage is used for custom indicators, saved backtest results, and exported data.</p>
          </div>
        </Card>
      </div>

      <Card className="border-destructive/20 mt-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-destructive/50" />
        <div className="p-6 space-y-6">
          <div className="flex gap-3">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
              <p className="text-sm text-muted-foreground mt-1">Irreversible actions regarding your Aegis Signal account.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-background/50">
              <div>
                <h4 className="font-medium text-sm">Log Out</h4>
                <p className="text-xs text-muted-foreground mt-1">End your current session.</p>
              </div>
              <Button variant="outline" className="gap-2">
                <LogOut className="size-4" /> Log Out
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div>
                <h4 className="font-medium text-sm text-destructive">Deactivate Account</h4>
                <p className="text-xs text-muted-foreground mt-1">Temporarily disable your account. You will not receive signals.</p>
              </div>
              <Button variant="outline" className="text-destructive hover:bg-destructive hover:text-destructive-foreground">
                Deactivate
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div>
                <h4 className="font-medium text-sm text-destructive">Delete Account</h4>
                <p className="text-xs text-muted-foreground mt-1">Permanently delete your account and all associated data. This action cannot be undone.</p>
              </div>
              <Button variant="destructive">
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
