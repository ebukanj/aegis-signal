import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Key, Plus, MoreHorizontal, AlertCircle } from "lucide-react";
import type { ApiKey } from "../types";

export function ApiKeysSettingsView({ apiKeys }: { apiKeys: ApiKey[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">API Keys</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage exchange connections for live and paper trading.</p>
        </div>
        <Button className="gap-2 shrink-0">
          <Plus className="size-4" /> Add API Key
        </Button>
      </div>

      <div className="bg-warning/10 text-warning p-4 rounded-lg flex gap-3 text-sm border border-warning/20">
        <AlertCircle className="size-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Security Notice</p>
          <p className="text-warning/80">Never share your API keys. Aegis Signal stores keys securely using AES-256-GCM encryption. We recommend restricting API key IP access to our static IP addresses if supported by your exchange.</p>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exchange & Name</TableHead>
              <TableHead>Key Prefix</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>
                  <div className="font-medium">{key.name}</div>
                  <div className="text-xs text-muted-foreground">{key.exchange}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded w-fit">
                    <Key className="size-3" />
                    {key.keyPrefix}••••••••
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {key.permissions.map(perm => (
                      <Badge key={perm} variant="secondary" className="text-[10px] font-normal">
                        {perm}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(key.lastUsed * 1000).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`border-transparent text-[10px] uppercase ${
                      key.status === "active" ? "bg-success/10 text-success" : 
                      key.status === "expired" ? "bg-warning/10 text-warning" : 
                      "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {key.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {apiKeys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No API keys configured. Add an exchange key to start trading.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
