import {
  Zap,
  Radar,
  FlaskConical,
  LineChart,
  Newspaper,
  Bell,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** One-line answer to the page's primary question. Shown in tooltips. */
  description: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Primary navigation.
 *
 * Five workspaces, not ten. Aegis Signal does exactly one thing — hand the
 * trader the few trades worth taking today (AGENTS.md §1) — and every screen
 * here earns its place against that:
 *
 *   Signals      the product itself
 *   Scanner      proof the machine looked, and why most things were rejected
 *   Strategies   the rules, in plain English, yours to edit
 *   Track Record did our signals actually make money
 *   Settings     alerts and preferences
 *
 * Backtesting, Paper Trading and the Dashboard were removed (ADR-023):
 * the first two are jobs traders do better in TradingView or on a live
 * exchange, and the third was a page that summarised other pages.
 */
export const navigation: NavSection[] = [
  {
    label: "Trade",
    items: [
      {
        title: "Signals",
        href: "/signals",
        icon: Zap,
        description: "What should I trade today",
      },
      {
        title: "Market Scanner",
        href: "/scanner",
        icon: Radar,
        description: "What the scan found — and what it rejected",
      },
      {
        title: "Insights",
        href: "/insights",
        icon: Newspaper,
        description: "News, social and fundamentals — the context",
      },
    ],
  },
  {
    label: "Rules",
    items: [
      {
        title: "Strategies",
        href: "/strategies",
        icon: FlaskConical,
        description: "The rules that produce signals",
      },
      {
        title: "Track Record",
        href: "/track-record",
        icon: LineChart,
        description: "Have these signals actually made money",
      },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
        description: "Where Prime signals get delivered",
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        description: "Preferences and exchanges",
      },
      {
        title: "Administration",
        href: "/admin",
        icon: ShieldCheck,
        description: "Platform management",
      },
    ],
  },
];

/** Flat list used for breadcrumbs and page titles. */
export const allNavItems: NavItem[] = navigation.flatMap((s) => s.items);
