"use client";

import { useSettingsStore } from "../stores/settings-store";
import { mockSettingsData } from "../data/mock-settings";
import { SettingsSidebar } from "./settings-sidebar";
import { ProfileSettings } from "./profile-settings";
import { AppearanceSettingsView } from "./appearance-settings";
import { TradingPreferencesView } from "./trading-preferences";
import { SecuritySettingsView } from "./security-settings";
import { ApiKeysSettingsView } from "./api-keys-settings";
import { ConnectedAccountsView } from "./connected-accounts";
import { IntegrationsSettingsView } from "./integrations-settings";
import { PrivacyAccessibilityView } from "./privacy-accessibility";
import { AccountSettingsView } from "./account-settings";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function SettingsWorkspace() {
  const { activeCategory } = useSettingsStore();
  const data = mockSettingsData;

  const renderContent = () => {
    switch (activeCategory) {
      case "profile":
        return <ProfileSettings profile={data.profile} />;
      case "appearance":
        return <AppearanceSettingsView settings={data.appearance} />;
      case "trading":
        return <TradingPreferencesView prefs={data.trading} />;
      case "notifications":
        // Notifications is a separate massive workspace, so we just link to it here.
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Notifications</h2>
              <p className="text-muted-foreground text-sm mt-1">Manage your alert routing, channels, and quiet hours.</p>
            </div>
            <div className="p-8 border rounded-lg bg-muted/30 flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-primary/10 p-4 rounded-full">
                <ArrowRight className="size-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Notification Center</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Notification settings are managed in a dedicated workspace to provide advanced routing and testing tools.
                </p>
              </div>
              <Button asChild>
                <Link href="/notifications">Open Notification Center</Link>
              </Button>
            </div>
          </div>
        );
      case "security":
        return <SecuritySettingsView security={data.security} />;
      case "api-keys":
        return <ApiKeysSettingsView apiKeys={data.apiKeys} />;
      case "connected-accounts":
        return <ConnectedAccountsView accounts={data.connectedAccounts} />;
      case "integrations":
        return <IntegrationsSettingsView integrations={data.integrations} />;
      case "privacy":
      case "accessibility":
        return <PrivacyAccessibilityView privacy={data.privacy} accessibility={data.accessibility} />;
      case "about":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">About Aegis Signal</h2>
              <p className="text-muted-foreground text-sm mt-1">System information and resources.</p>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b">
                <span className="text-sm font-medium">Version</span>
                <span className="text-sm text-muted-foreground font-mono">v1.0.0-rc.4</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="text-sm font-medium">Environment</span>
                <span className="text-sm text-muted-foreground">Production</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="text-sm font-medium">Build ID</span>
                <span className="text-sm text-muted-foreground font-mono">8f92a1c</span>
              </div>
              <div className="flex justify-between py-3 border-b">
                <span className="text-sm font-medium">Documentation</span>
                <a href="#" className="text-sm text-primary hover:underline">View Docs</a>
              </div>
            </div>
          </div>
        );
      case "account":
        return <AccountSettingsView account={data.account} />;
      default:
        return <div>Select a category</div>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-12 pb-20 pt-4">
      <SettingsSidebar />
      <div className="flex-1 max-w-4xl min-h-[600px]">
        {renderContent()}
      </div>
    </div>
  );
}
