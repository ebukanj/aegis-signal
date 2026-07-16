import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

/**
 * The honest label on a surface whose backend does not exist yet.
 *
 * The platform's rule is that nothing is faked silently — so where a screen still
 * renders placeholder data (users, roles, workers, historical charts), it says so
 * plainly, names the milestone that will make it real, and does not pretend the
 * numbers below it are live.
 */
export function NotLiveBanner({ milestone, what }: { milestone: string; what: string }) {
  return (
    <Card className="border-warning/40 bg-warning/5 mb-6">
      <div className="p-4 flex gap-3 items-start">
        <Construction className="size-5 text-warning shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-medium text-warning">Preview — not live yet.</span>{" "}
          <span className="text-muted-foreground">
            {what} arrives with {milestone}. The figures below are illustrative placeholders, not real platform data.
          </span>
        </div>
      </div>
    </Card>
  );
}
