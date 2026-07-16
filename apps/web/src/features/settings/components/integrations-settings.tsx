"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TelegramConnectCard } from "./telegram-connect-card";

/**
 * Integrations — Telegram is LIVE (M18); the rest are honestly labelled roadmap.
 * Each unlocks when its provider is wired for real (WhatsApp needs a Meta
 * business app; email an SMTP credential) — never before.
 */
const ROADMAP = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Signal alerts over WhatsApp Business. Needs Meta app approval — Telegram is the free path today.",
  },
  {
    id: "email",
    name: "Email",
    description: "Daily digests and signal alerts by email, once an SMTP credential is configured.",
  },
] as const;

export function IntegrationsSettingsView() {
  return (
    <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where your signals get delivered, beyond the app.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TelegramConnectCard />

        {ROADMAP.map((item) => (
          <Card key={item.id} className="flex flex-col gap-3 p-5 opacity-70">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{item.name}</h3>
              <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
            </div>
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
