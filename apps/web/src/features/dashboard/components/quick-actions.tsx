import Link from "next/link";
import { BarChart3, History, Radar, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { label: "Open Scanner", href: "/scanner", icon: Radar },
  { label: "View Signals", href: "/signals", icon: Zap },
  { label: "Run Backtest", href: "/backtesting", icon: History },
  { label: "Paper Trading", href: "/paper-trading", icon: Wallet },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
] as const;

/** One-click entry points into the main workflows. */
export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.href} asChild variant="outline" size="sm">
          <Link href={action.href}>
            <action.icon /> {action.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
