"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ShieldAlert, AlertTriangle, Zap, Info, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotificationHistoryItem, AlertPriority } from "../types";

const priorityConfig: Record<AlertPriority, { icon: LucideIcon, color: string }> = {
  CRITICAL: { icon: ShieldAlert, color: "text-destructive" },
  HIGH: { icon: AlertTriangle, color: "text-warning" },
  MEDIUM: { icon: Zap, color: "text-primary" },
  LOW: { icon: Info, color: "text-muted-foreground" },
};

export function NotificationHistory({ history }: { history: NotificationHistoryItem[] }) {
  const [search, setSearch] = useState("");

  const filtered = history.filter(item => 
    item.message.toLowerCase().includes(search.toLowerCase()) ||
    item.coin?.toLowerCase().includes(search.toLowerCase()) ||
    item.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Notification Ledger</h3>
          <p className="text-sm text-muted-foreground">Historical log of all dispatched communications.</p>
        </div>
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input 
            placeholder="Search messages, coins, or types..." 
            className="pl-8" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <div className="max-h-[700px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const priority = priorityConfig[item.priority];
              const PIcon = priority.icon;

              return (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-sm font-numeric">
                    {new Date(item.timestamp * 1000).toLocaleString([], { 
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" 
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PIcon className={`size-4 ${priority.color}`} />
                      <span className="font-medium">{item.type.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{item.message}</span>
                    {item.coin && (
                      <Badge variant="outline" className="ml-2 font-mono text-[10px]">{item.coin}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{item.channel}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] border-transparent ${
                        item.status === "DELIVERED" ? "text-success bg-success/10" :
                        item.status === "FAILED" ? "text-destructive bg-destructive/10" :
                        "text-muted-foreground bg-muted"
                      }`}
                    >
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No notifications match your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
