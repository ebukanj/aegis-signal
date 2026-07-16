"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Check, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { telegramApi } from "@/features/settings/api/telegram-api";

/**
 * Telegram connect — LIVE (M18). Shows whether the server has a bot configured and
 * whether THIS user has linked their chat, and drives the link flow: tap Connect,
 * open the deep link, press Start in Telegram, and the card flips to Connected as
 * the backend polls the link through.
 */
export function TelegramConnectCard() {
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);

  const status = useQuery({
    queryKey: ["telegram", "status"],
    queryFn: () => telegramApi.status(),
    // While the user is completing the link in Telegram, poll so the card flips to
    // Connected on its own the moment the backend records it.
    refetchInterval: (query) => (linking && !query.state.data?.connected ? 3000 : false),
  });

  const connect = async () => {
    try {
      const { deepLink } = await telegramApi.link();
      window.open(deepLink, "_blank", "noopener,noreferrer");
      setLinking(true);
      toast.info("Telegram opened — press Start to connect this chat.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not start linking.");
    }
  };

  const disconnect = async () => {
    try {
      await telegramApi.unlink();
      setLinking(false);
      await queryClient.invalidateQueries({ queryKey: ["telegram", "status"] });
      toast.success("Telegram disconnected.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not disconnect.");
    }
  };

  const data = status.data;
  const connected = data?.connected ?? false;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-[#229ED9]/15 text-[#229ED9]">
            <Send className="size-4" />
          </span>
          <h3 className="font-semibold">Telegram</h3>
        </div>
        {connected ? (
          <Badge className="gap-1 bg-success/15 text-success">
            <Check className="size-3" /> Connected
          </Badge>
        ) : data?.configured ? (
          <Badge variant="secondary" className="text-[10px]">Not connected</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">Unavailable</Badge>
        )}
      </div>

      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
        Get Prime signals and alerts for the coins on your watchlist delivered
        straight to Telegram — instantly, wherever you are.
      </p>

      <div className="mt-1 border-t pt-3">
        {status.isPending ? (
          <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
            <Loader2 className="size-3.5 animate-spin" /> Checking…
          </Button>
        ) : !data?.configured ? (
          <p className="text-[11px] text-muted-foreground">
            The server has no Telegram bot configured yet. An admin sets{" "}
            <code className="rounded bg-muted px-1">TELEGRAM_BOT_TOKEN</code> to enable it.
          </p>
        ) : connected ? (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={disconnect}>
            Disconnect
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="w-full gap-1 text-xs" onClick={connect}>
            {linking ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Waiting for Telegram…
              </>
            ) : (
              <>
                <ExternalLink className="size-3.5" /> Connect Telegram
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}
