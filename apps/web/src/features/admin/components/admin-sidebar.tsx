"use client";

import { useAdminStore, type AdminCategory } from "../stores/admin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, LayoutDashboard, HeartPulse, Users,
  ArrowRightLeft, ListOrdered,
  Flag, FileClock, ShieldAlert
} from "lucide-react";

/**
 * Every entry here is REAL — it reads or writes the live platform. The mock
 * panels the console used to carry (worker nodes, AI providers, fake monitoring
 * charts, invented system logs) are gone: an admin console that shows invented
 * infrastructure is worse than a smaller one that tells the truth.
 */
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
    ]
  },
  {
    title: "Infrastructure",
    items: [
      { id: "exchanges", label: "Exchanges", icon: ArrowRightLeft },
      { id: "queues", label: "Queues", icon: ListOrdered },
    ]
  },
  {
    title: "Observability",
    items: [
      { id: "feature-flags", label: "Feature Flags", icon: Flag },
      { id: "audit-logs", label: "Audit Logs", icon: FileClock },
    ]
  },
  {
    title: "System",
    items: [
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
