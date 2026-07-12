import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ShieldAlert, ShieldCheck, KeyRound, Smartphone, Laptop } from "lucide-react";
import type { SecuritySettings } from "../types";

export function SecuritySettingsView({ security }: { security: SecuritySettings }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Security</h2>
        <p className="text-muted-foreground text-sm mt-1">Protect your account and monitor active sessions.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 md:col-span-2 flex flex-col justify-center">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-full ${security.securityScore > 80 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
              {security.securityScore > 80 ? <ShieldCheck className="size-8" /> : <ShieldAlert className="size-8" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold">Security Score: {security.securityScore}/100</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your account is highly secure. You have 2FA enabled and recovery codes stored safely.
              </p>
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-semibold mb-2 text-sm">Two-Factor Authentication</h3>
          <p className="text-xs text-muted-foreground mb-4">Add an extra layer of security to your account.</p>
          <div className="flex items-center justify-between">
            <Badge variant={security.twoFactorEnabled ? "default" : "secondary"}>
              {security.twoFactorEnabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button variant="outline" size="sm">Manage 2FA</Button>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4 text-sm">Change Password</h3>
        <div className="grid gap-4 md:grid-cols-2 max-w-2xl">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Current Password</label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm New Password</label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="md:col-span-2 pt-2">
            <Button>Update Password</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-sm">Active Sessions</h3>
            <p className="text-xs text-muted-foreground">Devices currently logged into your account.</p>
          </div>
          <Button variant="destructive" size="sm">Revoke All Other Sessions</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {security.recentSessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {session.device.toLowerCase().includes("iphone") || session.device.toLowerCase().includes("android") ? (
                      <Smartphone className="size-4 text-muted-foreground" />
                    ) : (
                      <Laptop className="size-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{session.device}</span>
                    {session.isCurrent && (
                      <Badge variant="outline" className="ml-2 text-[10px] text-primary border-primary/20 bg-primary/5">Current</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{session.browser}</div>
                </TableCell>
                <TableCell className="text-sm">{session.location}</TableCell>
                <TableCell className="text-sm font-mono">{session.ipAddress}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {session.isCurrent ? "Active now" : new Date(session.lastActive * 1000).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {!session.isCurrent && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
