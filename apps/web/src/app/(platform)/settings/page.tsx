import type { Metadata } from "next";
import { SettingsWorkspace } from "@/features/settings/components/settings-workspace";

export const metadata: Metadata = {
  title: "Settings & Preferences",
  description: "Personalized control hub for your Aegis Signal experience.",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="border-b pb-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and set your platform preferences.</p>
      </div>
      <SettingsWorkspace />
    </div>
  );
}
