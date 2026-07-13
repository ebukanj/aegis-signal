"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatSignalForSharing } from "@/lib/share-signal";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Copy the signal as clean plain text.
 *
 * A trader's next move after reading a signal is often to paste it — into their
 * journal, into a group chat, into a note next to the order ticket. That should
 * be one click from the panel, not a trip to the full report.
 */
export function CopySignalButton({
  signal,
  className,
}: {
  signal: Opportunity;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatSignalForSharing(signal));
      setCopied(true);
      toast.success("Signal copied", {
        description: "Pastes cleanly into WhatsApp, Telegram or a note.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy", {
        description: "Your browser blocked clipboard access.",
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={copy}
      className={className}
      aria-label={`Copy ${signal.direction} ${signal.pair} signal to clipboard`}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy signal"}
    </Button>
  );
}
