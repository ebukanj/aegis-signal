"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Smartphone, Mail, Globe, MessageSquare, Hash, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import type { UserPreferences } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { authApi } from "@/features/auth/api/auth-api";
import type { NotificationChannel, ChannelType } from "../types";

const channelIcons: Record<ChannelType, LucideIcon> = {
  TELEGRAM: Send,
  WHATSAPP: Smartphone,
  EMAIL: Mail,
  BROWSER: Globe,
  DISCORD: MessageSquare,
  SLACK: Hash,
  PUSH: Smartphone,
};

/** Which preference key a channel's toggle writes. Absent = no toggle (roadmap). */
const PREF_KEY: Partial<Record<ChannelType, keyof UserPreferences["notifications"]>> = {
  BROWSER: "inApp",
  TELEGRAM: "telegram",
  EMAIL: "email",
};

/**
 * Communication channels — LIVE. The switches write YOUR real preferences (the
 * same document the delivery engine reads before it sends anything), and the
 * Telegram card links to the real connect flow. The old Configure/Test buttons
 * that did nothing are gone.
 */
export function ChannelManagement({ channels }: { channels: NotificationChannel[] }) {
  const queryClient = useQueryClient();

  const prefs = useQuery({ queryKey: ["preferences"], queryFn: () => authApi.getPreferences() });

  const toggle = useMutation({
    mutationFn: (patch: Partial<UserPreferences["notifications"]>) =>
      authApi.updatePreferences({
        notifications: { ...prefs.data!.notifications, ...patch },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["preferences"], updated);
      toast.success("Channel preference saved.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not save."),
  });

  const enabledFor = (type: ChannelType): boolean => {
    const key = PREF_KEY[type];
    if (!key || !prefs.data) return false;
    return Boolean(prefs.data.notifications[key]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Communication Channels</h3>
        <p className="text-sm text-muted-foreground">
          Where your alerts are delivered. These switches are yours — the delivery
          engine checks them before every send.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => {
          const Icon = channelIcons[channel.type];
          const prefKey = PREF_KEY[channel.type];
          const enabled = enabledFor(channel.type);

          return (
            <Card
              key={channel.id}
              className={`flex flex-col gap-4 p-5 ${channel.isComingSoon ? "opacity-60 grayscale" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-md p-2 ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{channel.name}</h4>
                    {channel.isComingSoon ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">Coming Soon</Badge>
                    ) : (
                      <Badge variant={enabled ? "default" : "secondary"} className="mt-1 text-[10px]">
                        {enabled ? "ON" : "OFF"}
                      </Badge>
                    )}
                  </div>
                </div>
                {prefKey && !channel.isComingSoon && (
                  <Switch
                    checked={enabled}
                    disabled={prefs.isPending || toggle.isPending}
                    onCheckedChange={(next) => toggle.mutate({ [prefKey]: next })}
                    aria-label={`Toggle ${channel.name}`}
                  />
                )}
              </div>

              <div className="mt-auto text-xs text-muted-foreground">
                {channel.lastDelivery ? (
                  <span>Last delivery: {new Date(channel.lastDelivery * 1000).toLocaleString()}</span>
                ) : (
                  <span>No deliveries yet</span>
                )}
              </div>

              {channel.type === "TELEGRAM" && !channel.isComingSoon && (
                <div className="mt-2 border-t pt-2">
                  <Button asChild variant="outline" size="sm" className="w-full gap-1 text-xs">
                    <Link href="/settings">
                      <Settings2 className="size-3.5" /> Manage connection
                    </Link>
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
