"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { EconomicEvent, MacroDirection } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { macroApi } from "@/features/macro/api/macro-api";

/**
 * The economic calendar — the scheduled events that move the whole market at once.
 *
 * Upcoming events (with a countdown) so a trader knows to stand down before a
 * release, and recently-printed ones with the platform's read of the surprise.
 * The read is context, never an instruction: it colours the backdrop; the chart
 * still has to earn every trade.
 */
export function EconomicCalendar() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["macro", "calendar"],
    queryFn: () => macroApi.calendar(),
    refetchInterval: 60_000,
  });

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">Economic calendar</h2>
        {data && (
          <span className="text-xs text-muted-foreground">
            {data.source === "PROVIDER" ? "live feed" : "FOMC schedule"}
          </span>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <p className="text-xs text-muted-foreground">The calendar could not be loaded.</p>
      ) : (
        <>
          {data.window.active && data.window.event && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p className="text-xs leading-relaxed">
                <span className="font-medium text-warning">Macro window open.</span>{" "}
                {data.window.event.title}{" "}
                {typeof data.window.minutesUntil === "number" &&
                  (data.window.minutesUntil >= 0
                    ? `in ~${data.window.minutesUntil} min`
                    : `printed ${-data.window.minutesUntil} min ago`)}
                . Expect volatility — stand down or size down.
              </p>
            </div>
          )}

          {data.upcoming.length === 0 && data.recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">No high-impact events in the window.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {data.upcoming.slice(0, 6).map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
              {data.recent.slice(0, 3).map((e) => (
                <EventRow key={e.id} event={e} past />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function EventRow({ event, past = false }: { event: EconomicEvent; past?: boolean }) {
  const when = new Date(event.time);
  return (
    <div className={cn("flex items-center gap-3 py-2.5", past && "opacity-60")}>
      <ImpactDot impact={event.impact} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{event.title}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{event.country}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {when.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          {event.forecast && ` · forecast ${event.forecast}`}
          {event.actual && ` · actual ${event.actual}`}
        </span>
      </div>
      {event.interpretation ? (
        <DirectionBadge direction={event.interpretation.direction} title={event.interpretation.rationale} />
      ) : !past ? (
        <span className="font-numeric text-xs text-muted-foreground">{countdown(when)}</span>
      ) : null}
    </div>
  );
}

function ImpactDot({ impact }: { impact: EconomicEvent["impact"] }) {
  const tone = impact === "HIGH" ? "bg-destructive" : impact === "MEDIUM" ? "bg-warning" : "bg-muted-foreground/50";
  return <span className={cn("size-2 shrink-0 rounded-full", tone)} aria-label={`${impact} impact`} />;
}

function DirectionBadge({ direction, title }: { direction: MacroDirection; title: string }) {
  if (direction === "RISK_ON")
    return <Badge title={title} className="gap-1 bg-success/15 text-success"><TrendingUp className="size-3" /> Risk-on</Badge>;
  if (direction === "RISK_OFF")
    return <Badge title={title} className="gap-1 bg-destructive/15 text-destructive"><TrendingDown className="size-3" /> Risk-off</Badge>;
  return <Badge title={title} variant="secondary" className="gap-1"><Minus className="size-3" /> Neutral</Badge>;
}

function countdown(when: Date): string {
  const mins = Math.round((when.getTime() - Date.now()) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
