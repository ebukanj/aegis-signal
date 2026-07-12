import Link from "next/link";
import { ArrowRight, CheckCircle2, Filter, FlaskConical, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { SignalDetail } from "@/features/signals/types";
import { cn } from "@/lib/utils";

function ChecklistGroup({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Filter;
  items: string[];
}) {
  return (
    <div className="space-y-2">
      <p className="label-caps flex items-center gap-1.5">
        <Icon className="size-3.5" aria-hidden /> {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm">
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0 text-success"
              aria-label="Satisfied"
            />
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Answers: "Why did this signal trigger?"
 * Which strategy fired, the conditions it required, the filters that gated
 * it, and the independent confirmations behind it — in plain language.
 */
export function StrategyExplanation({
  signal,
  className,
}: {
  signal: SignalDetail;
  className?: string;
}) {
  return (
    <Card className={cn("gap-4 p-4 md:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">
            Why This Signal Exists
          </h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/strategies">
            {signal.strategies[0]} <ArrowRight />
          </Link>
        </Button>
      </div>

      <p className="text-sm leading-relaxed">{signal.explanation.summary}</p>

      {signal.strategies.length > 1 && (
        <div className="rounded-lg border border-info/25 bg-info/5 p-3">
          <p className="label-caps text-info">Strategy confluence</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {signal.strategies.length} independent strategies reached the same
            conclusion without communicating:{" "}
            <span className="text-foreground">
              {signal.strategies.join(" + ")}
            </span>
            . Confluence signals are historically the platform&apos;s
            strongest class, which is reflected in the confidence score.
          </p>
        </div>
      )}

      <Separator />

      <div className="grid gap-5 md:grid-cols-3">
        <ChecklistGroup
          title="Conditions Satisfied"
          icon={ListChecks}
          items={signal.explanation.conditions}
        />
        <ChecklistGroup
          title="Filters Passed"
          icon={Filter}
          items={signal.explanation.filters}
        />
        <ChecklistGroup
          title="Confirmations"
          icon={CheckCircle2}
          items={signal.explanation.confirmations}
        />
      </div>
    </Card>
  );
}
