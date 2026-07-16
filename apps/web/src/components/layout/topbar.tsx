"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/shared/command-palette";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { allNavItems } from "@/config/navigation";
import { REGIME_META } from "@/constants/domain";
import { signalsApi } from "@/features/signals/api/signals-api";
import { cn } from "@/lib/utils";

/**
 * Global top bar: sidebar trigger, current workspace title, and LIVE platform
 * status — the market regime and the data-feed connection, both read from the
 * real backend (M15). No placeholders: if the feed is unreachable the indicator
 * says so honestly rather than pretending to be on standby.
 */
export function Topbar() {
  const pathname = usePathname();
  const current = allNavItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  // The whole platform's status in one small query: the feed carries the market
  // regime it was produced against, and whether it loads at all is the truest
  // connection signal we have.
  const feed = useQuery({
    queryKey: ["signals", "today"],
    queryFn: () => signalsApi.getTodaysSignals(),
    refetchInterval: 60_000,
  });

  const regime = feed.data?.context.regime;
  const regimeMeta = regime ? REGIME_META[regime] : null;

  const connection: { label: string; tone: string; tip: string } = feed.isError
    ? { label: "Offline", tone: "bg-destructive", tip: "The market data feed is unreachable" }
    : feed.isSuccess
      ? { label: "Live", tone: "bg-success", tip: "Streaming live market data" }
      : { label: "Connecting", tone: "bg-muted-foreground/50", tip: "Connecting to the market feed" };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
      <SidebarTrigger className="-ml-1.5" />
      <Separator orientation="vertical" className="!h-5" />

      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-sm font-semibold tracking-tight">
          {current?.title ?? "Aegis Signal"}
        </h1>
        {current?.description && (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {current.description}
          </p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />

        {/* Market regime — live, from the Market Regime Engine via the feed. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="label-caps hidden items-center gap-2 rounded-md border px-2.5 py-1.5 md:flex">
              <span>Regime</span>
              {regimeMeta ? (
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", DOT[regimeMeta.status])} />
                  <span className="font-medium text-foreground/80">{regimeMeta.label}</span>
                </span>
              ) : (
                <span className="font-numeric text-foreground/50">—</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {regimeMeta?.meaning ?? "Awaiting the first classified market context."}
          </TooltipContent>
        </Tooltip>

        {/* Data-feed connection — real, not a standby placeholder. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 sm:flex"
              aria-label={`Data feed status: ${connection.label}`}
            >
              <span className={cn("size-1.5 rounded-full", connection.tone)} />
              <span className="text-xs text-muted-foreground">{connection.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{connection.tip}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifications</TooltipContent>
        </Tooltip>

        <ThemeSwitcher />
      </div>
    </header>
  );
}

/** Regime status → dot colour. Matches the platform's semantic palette. */
const DOT: Record<string, string> = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
};
