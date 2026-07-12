import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Send, Smartphone, Mail, Globe, MessageSquare, Hash } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

export function ChannelManagement({ channels }: { channels: NotificationChannel[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Communication Channels</h3>
        <p className="text-sm text-muted-foreground">Configure where your alerts are delivered.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => {
          const Icon = channelIcons[channel.type];
          return (
            <Card key={channel.id} className={`p-5 flex flex-col gap-4 ${channel.isComingSoon ? "opacity-60 grayscale" : ""}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${channel.status === "CONNECTED" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{channel.name}</h4>
                    {channel.isComingSoon ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">Coming Soon</Badge>
                    ) : (
                      <Badge 
                        variant={channel.status === "CONNECTED" ? "default" : channel.status === "MUTED" ? "outline" : "secondary"} 
                        className="mt-1 text-[10px]"
                      >
                        {channel.status}
                      </Badge>
                    )}
                  </div>
                </div>
                {!channel.isComingSoon && (
                  <Switch checked={channel.status === "CONNECTED" || channel.status === "MUTED"} disabled />
                )}
              </div>

              <div className="text-xs text-muted-foreground mt-auto">
                {channel.lastDelivery ? (
                  <span>Last delivery: {new Date(channel.lastDelivery * 1000).toLocaleString()}</span>
                ) : (
                  <span>No deliveries yet</span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t mt-2">
                <Button variant="outline" size="sm" className="w-full text-xs" disabled={channel.isComingSoon}>
                  {channel.status === "DISCONNECTED" ? "Connect" : "Configure"}
                </Button>
                <Button variant="secondary" size="sm" className="w-full text-xs" disabled={channel.status !== "CONNECTED"}>
                  Test
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
