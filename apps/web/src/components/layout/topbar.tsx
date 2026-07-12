"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
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

/**
 * Global top bar: sidebar trigger, current workspace title, and platform
 * status affordances. The market-regime and connection indicators are
 * design placeholders until live data arrives (Phase 2).
 */
export function Topbar() {
  const pathname = usePathname();
  const current = allNavItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

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

        {/* Market regime — populated by the Market Regime Engine in Phase 2 */}
        <div className="label-caps hidden items-center gap-2 rounded-md border px-2.5 py-1.5 md:flex">
          <span>Regime</span>
          <span className="font-numeric text-foreground/70">—</span>
        </div>

        {/* Scanner connectivity — wired to platform health in Phase 2 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 sm:flex"
              aria-label="Data feed status: awaiting connection"
            >
              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">Standby</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Data feed connects in Phase 2</TooltipContent>
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
