import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ConnectedAccount } from "../types";

export function ConnectedAccountsView({ accounts }: { accounts: ConnectedAccount[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Connected Accounts</h2>
        <p className="text-muted-foreground text-sm mt-1">Link your social and utility accounts for quick login and data syncing.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => (
          <Card key={account.id} className="p-5 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{account.provider}</h3>
                {account.accountIdentifier && (
                  <p className="text-xs text-muted-foreground mt-0.5">{account.accountIdentifier}</p>
                )}
              </div>
              <Badge variant={account.status === "connected" ? "default" : "secondary"}>
                {account.status}
              </Badge>
            </div>
            
            <div className="text-xs text-muted-foreground mt-auto pt-2">
              {account.lastActivity ? (
                <span>Last used: {new Date(account.lastActivity * 1000).toLocaleDateString()}</span>
              ) : (
                <span>Never connected</span>
              )}
            </div>

            <div className="pt-3 border-t mt-1">
              {account.status === "connected" ? (
                <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                  Disconnect
                </Button>
              ) : (
                <Button variant="secondary" size="sm" className="w-full">
                  Connect {account.provider}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
