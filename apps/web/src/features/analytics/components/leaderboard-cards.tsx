"use client";

import {
  Award,
  BarChart3,
  Crown,
  Shield,
  Target,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChartCard } from "@/components/shared/chart-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaderboardEntry, LeaderboardKey } from "../types";
import { cn } from "@/lib/utils";

const LEADERBOARD_ICONS: Record<LeaderboardKey, LucideIcon> = {
  topPerformer: Crown,
  mostConsistent: Shield,
  highestWinRate: Target,
  highestProfitFactor: BarChart3,
  mostActive: Zap,
  bestCurrent: Award,
};

interface LeaderboardCardsProps {
  leaderboards: LeaderboardEntry[];
  loading?: boolean;
  className?: string;
}

/**
 * 6 leaderboard cards: top performer, most consistent, highest win rate,
 * highest profit factor, most active, best current performer.
 */
export function LeaderboardCards({
  leaderboards,
  loading = false,
  className,
}: LeaderboardCardsProps) {
  if (loading) {
    return (
      <ChartCard title="Leaderboards" className={className}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Leaderboards" description="Top strategies by key dimensions" className={className}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {leaderboards.map((entry) => {
          const Icon = LEADERBOARD_ICONS[entry.key] ?? Award;
          return (
            <Card
              key={entry.key}
              className="gap-2 p-3 transition-colors hover:border-primary/25"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {entry.title}
                </span>
              </div>
              <p className="truncate text-sm font-semibold">{entry.strategy ?? "—"}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-numeric font-medium text-primary">
                  {entry.metric}
                </span>
                <span className="text-muted-foreground">{entry.metricLabel}</span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">{entry.note}</p>
            </Card>
          );
        })}
      </div>
    </ChartCard>
  );
}
