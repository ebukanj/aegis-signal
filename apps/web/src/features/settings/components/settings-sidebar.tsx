"use client";

import { useSettingsStore, type SettingsCategory } from "../stores/settings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, User, Palette, Sliders, Bell, Shield, Link, Key, Blocks, Eye, Accessibility, Info, UserCircle } from "lucide-react";

const navigationGroups = [
  {
    title: "Personal",
    items: [
      { id: "profile", label: "Profile", icon: User },
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "trading", label: "Trading Preferences", icon: Sliders },
      { id: "notifications", label: "Notifications", icon: Bell },
    ]
  },
  {
    title: "Security & Connections",
    items: [
      { id: "security", label: "Security", icon: Shield },
      { id: "connected-accounts", label: "Connected Accounts", icon: Link },
      { id: "api-keys", label: "API Keys", icon: Key },
      { id: "integrations", label: "Integrations", icon: Blocks },
    ]
  },
  {
    title: "System",
    items: [
      { id: "privacy", label: "Data & Privacy", icon: Eye },
      { id: "accessibility", label: "Accessibility", icon: Accessibility },
      { id: "about", label: "About Aegis", icon: Info },
      { id: "account", label: "Account Management", icon: UserCircle },
    ]
  }
];

export function SettingsSidebar() {
  const { activeCategory, setActiveCategory, searchQuery, setSearchQuery } = useSettingsStore();

  return (
    <aside className="w-full lg:w-64 space-y-6">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input 
          placeholder="Search settings..." 
          className="pl-8 bg-background" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <nav className="space-y-6">
        {navigationGroups.map((group) => (
          <div key={group.title} className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
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
                    className={`w-full justify-start text-sm ${isActive ? "font-semibold" : "font-normal"}`}
                    onClick={() => setActiveCategory(item.id as SettingsCategory)}
                  >
                    <Icon className={`size-4 mr-3 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
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
