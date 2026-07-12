"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  MoreHorizontal,
  Printer,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SignalStatusBadge } from "@/features/signals/components/signal-status-badge";
import type { SignalDetail } from "@/features/signals/types";
import { copySignal } from "@/features/signals/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

interface SignalHeaderProps {
  signal: SignalDetail;
  prevId: string | null;
  nextId: string | null;
}

/** Report header: identity, status, navigation, and export actions. */
export function SignalHeader({ signal, prevId, nextId }: SignalHeaderProps) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/scanner">
              <ArrowLeft /> Scanner
            </Link>
          </Button>
          <Breadcrumbs />
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={!prevId}
                onClick={() => prevId && router.push(`/signals/${prevId}`)}
                aria-label="Previous signal (higher rank)"
              >
                <ChevronLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous signal</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={!nextId}
                onClick={() => nextId && router.push(`/signals/${nextId}`)}
                aria-label="Next signal (lower rank)"
              >
                <ChevronRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next signal</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {signal.pair}
            </h1>
            <DirectionBadge direction={signal.direction} />
            <SignalStatusBadge status={signal.status} />
            {signal.isPrime && (
              <StatusBadge status="warning" dot={false}>
                ★ Prime
              </StatusBadge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {signal.exchange} · {signal.strategies.join(" + ")} · {signal.timeframe} ·
            generated {formatRelativeTime(signal.generatedAt)} ·{" "}
            <span className="font-numeric">
              {formatDateTime(signal.generatedAt)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={bookmarked}
            onClick={() => {
              setBookmarked((prev) => !prev);
              toast.info(
                bookmarked
                  ? "Bookmark removed."
                  : "Bookmarked — saved signals arrive with user preferences.",
              );
            }}
          >
            <Bookmark
              className={bookmarked ? "fill-primary text-primary" : undefined}
            />
            {bookmarked ? "Saved" : "Save"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => copySignal(signal)}>
            <Copy /> Copy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="More actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  toast.info("Sharing arrives with notification channels.")
                }
              >
                <Share2 /> Share
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  toast.info("PDF export arrives with the reporting service.")
                }
              >
                <FileDown /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  toast.info("Print layout arrives with the reporting service.")
                }
              >
                <Printer /> Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
