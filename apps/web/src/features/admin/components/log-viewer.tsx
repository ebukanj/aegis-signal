"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Filter } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditLog, SystemLog } from "../types";

export function LogViewer({ auditLogs, systemLogs, type }: { auditLogs: AuditLog[], systemLogs: SystemLog[], type: "audit" | "system" }) {
  const [search, setSearch] = useState("");

  const filteredAudit = auditLogs.filter(l => 
    l.user.toLowerCase().includes(search.toLowerCase()) || 
    l.action.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSystem = systemLogs.filter(l => 
    l.message.toLowerCase().includes(search.toLowerCase()) || 
    l.module.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {type === "audit" ? "Audit Logs" : "System Logs"}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {type === "audit" ? "Immutable record of administrative actions." : "Raw diagnostic output from platform services."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col min-h-[600px] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input 
              placeholder={type === "audit" ? "Search users or actions..." : "Search messages or modules..."} 
              className="pl-8" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="secondary" size="sm" className="gap-2">
            <Filter className="size-4" /> Filters
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {type === "audit" ? (
            <Table>
              <TableHeader className="sticky top-0 bg-card shadow-sm z-10">
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAudit.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground font-numeric">
                      {new Date(log.timestamp * 1000).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{log.user}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] font-mono">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.module}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{log.ipAddress}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-transparent text-[10px] uppercase ${log.status === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card shadow-sm z-10">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead className="w-[150px]">Module</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSystem.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground font-numeric">
                      {new Date(log.timestamp * 1000).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={`border-transparent text-[10px] uppercase ${
                          log.severity === "info" ? "bg-primary/10 text-primary" :
                          log.severity === "warning" ? "bg-warning/10 text-warning" :
                          log.severity === "error" || log.severity === "critical" ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {log.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{log.module}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground break-all">{log.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
