"use client";

import { useAdminStore, type AdminCategory } from "../stores/admin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, LayoutDashboard, HeartPulse, Users, Shield, LineChart, 
  ArrowRightLeft, Activity, ListOrdered, Cpu, Bell, Bot, 
  Flag, FileClock, ScrollText, BarChart3, Settings, ShieldAlert 
} from "lucide-react";

const navigationGroups = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "health", label: "Platform Health", icon: HeartPulse },
    ]
  },
  {
    title: "Access Control",
    items: [
      { id: "users", label: "Users", icon: Users },
      { id: "roles", label: "Roles & Permissions", icon: Shield },
    ]
  },
  {
    title: "Trading Engine",
    items: [
      { id: "strategies", label: "Strategies", icon: LineChart },
      { id: "exchanges", label: "Exchanges", icon: ArrowRightLeft },
      { id: "scanner", label: "Market Scanner", icon: Activity },
    ]
  },
  {
    title: "Infrastructure",
    items: [
      { id: "queues", label: "Queues", icon: ListOrdered },
      { id: "workers", label: "Workers", icon: Cpu },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "ai-providers", label: "AI Providers", icon: Bot },
    ]
  },
  {
    title: "Observability",
    items: [
      { id: "feature-flags", label: "Feature Flags", icon: Flag },
      { id: "audit-logs", label: "Audit Logs", icon: FileClock },
      { id: "system-logs", label: "System Logs", icon: ScrollText },
      { id: "monitoring", label: "Monitoring", icon: BarChart3 },
    ]
  },
  {
    title: "System",
    items: [
      { id: "configuration", label: "Configuration", icon: Settings },
      { id: "maintenance", label: "Maintenance Mode", icon: ShieldAlert },
    ]
  }
];

export function AdminSidebar() {
  const { activeCategory, setActiveCategory, searchQuery, setSearchQuery } = useAdminStore();

  return (
    <aside className="w-full lg:w-64 space-y-6">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input 
          placeholder="Search admin panels..." 
          className="pl-8 bg-background" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <nav className="space-y-6">
        {navigationGroups.map((group) => (
          <div key={group.title} className="space-y-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">
              {group.title}
            </h4>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeCategory === item.id;
                
                return (
                  <Button
                    key={item.id}
                    variant={isActive ? "secondary" : "ghost"}
                    className={`w-full justify-start text-sm h-8 px-3 ${isActive ? "font-semibold bg-primary/10 text-primary hover:bg-primary/15" : "font-normal text-muted-foreground"}`}
                    onClick={() => setActiveCategory(item.id as AdminCategory)}
                  >
                    <Icon className="size-4 mr-3 shrink-0" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
