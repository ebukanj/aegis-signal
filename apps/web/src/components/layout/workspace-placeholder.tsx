import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface WorkspacePlaceholderProps {
  icon: LucideIcon;
  title: string;
  /** The single question this workspace will answer. */
  question: string;
  phase: string;
}

/**
 * Temporary stand-in for workspaces built in later phases.
 * Keeps navigation honest: every route exists, and each page states the
 * question it will answer and when it arrives.
 */
export function WorkspacePlaceholder({
  icon: Icon,
  title,
  question,
  phase,
}: WorkspacePlaceholderProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          This workspace answers: <span className="text-foreground">&ldquo;{question}&rdquo;</span>
        </p>
      </div>
      <Badge variant="outline" className="text-muted-foreground">
        Arrives in {phase}
      </Badge>
    </div>
  );
}
