import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/layout/brand";

interface StatusPageProps {
  icon: LucideIcon;
  /** Short status code line, e.g. "404" or "503". */
  code?: string;
  title: string;
  description: string;
  /** Primary action; defaults to a link back to the dashboard. */
  action?: ReactNode;
}

/**
 * Full-page status screen (404, unauthorized, maintenance).
 * Public: renders without the platform shell.
 */
export function StatusPage({
  icon: Icon,
  code,
  title,
  description,
  action,
}: StatusPageProps) {
  return (
    <div className="flex min-h-svh flex-col p-6 md:p-10">
      <Brand />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-lg border bg-card text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="space-y-2">
          {code && <p className="font-numeric label-caps">{code}</p>}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </div>
        {action ?? (
          <Button asChild variant="outline">
            <Link href="/signals">Back to signals</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
