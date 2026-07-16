"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "../stores/settings-store";
import { SettingsSidebar } from "./settings-sidebar";
import { ProfileSettings } from "./profile-settings";
import { AppearanceSettingsView } from "./appearance-settings";
import { TradingPreferencesView } from "./trading-preferences";
import { SecuritySettingsView } from "./security-settings";
import { IntegrationsSettingsView } from "./integrations-settings";

/**
 * Settings — and every tab is REAL (M16+). Profile shows the signed-in account;
 * Trading Preferences and the password change write to the real API; Appearance
 * changes the actual theme; Integrations connects the actual Telegram bot. The
 * mock tabs this page used to carry (exchange API keys the platform never needs,
 * OAuth accounts that never existed, invented privacy toggles, a fake About) are
 * deleted — a settings page that pretends to save is worse than a smaller one
 * that saves.
 */
export function SettingsWorkspace() {
  const { activeCategory } = useSettingsStore();

  const renderContent = () => {
    switch (activeCategory) {
      case "profile":
        return <ProfileSettings />;
      case "appearance":
        return <AppearanceSettingsView />;
      case "trading":
        return <TradingPreferencesView />;
      case "notifications":
        return (
          <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Notifications</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Channels, delivery history and analytics live in the Notification Center.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border bg-muted/30 p-8 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <ArrowRight className="size-8 text-primary" />
              </div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Turn channels on or off, connect Telegram, and see every delivery the
                platform has made.
              </p>
              <Button asChild>
                <Link href="/notifications">Open Notification Center</Link>
              </Button>
            </div>
          </div>
        );
      case "security":
        return <SecuritySettingsView />;
      case "integrations":
        return <IntegrationsSettingsView />;
      default:
        return <div>Select a category</div>;
    }
  };

  return (
    <div className="flex flex-col gap-12 pb-20 pt-4 lg:flex-row">
      <SettingsSidebar />
      <div className="min-h-[600px] max-w-4xl flex-1">{renderContent()}</div>
    </div>
  );
}
