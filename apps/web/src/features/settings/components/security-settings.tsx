"use client";

import { ChangePasswordCard } from "./change-password-card";

/**
 * Security — the password change is LIVE (M16). The mock 2FA card, invented
 * security score and fabricated session table are gone: a security page that
 * shows made-up sessions teaches a user to ignore it. 2FA and session
 * management return here when they exist for real.
 */
export function SecuritySettingsView() {
  return (
    <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Security</h2>
        <p className="mt-1 text-sm text-muted-foreground">Protect your account.</p>
      </div>

      <ChangePasswordCard />

      <p className="text-xs text-muted-foreground">
        Sessions last 7 days and end when you sign out. Two-factor authentication is
        planned — it will appear here when it is real, not before.
      </p>
    </div>
  );
}
