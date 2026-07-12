import {
  LayoutDashboard,
  Radar,
  Zap,
  FlaskConical,
  BarChart3,
  History,
  Wallet,
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
 * Primary workspace navigation.
 * Mirrors the ten product workspaces defined in PROJECT_PRD.md §16.
 */
export const navigation: NavSection[] = [
  {
    label: "Intelligence",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "What is happening right now",
      },
      {
        title: "Market Scanner",
        href: "/scanner",
        icon: Radar,
        description: "What opportunities exist",
      },
      {
        title: "Signals",
        href: "/signals",
        icon: Zap,
        description: "Why each opportunity matters",
      },
    ],
  },
  {
    label: "Laboratory",
    items: [
      {
        title: "Strategies",
        href: "/strategies",
        icon: FlaskConical,
        description: "How each strategy is performing",
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
        description: "What the platform has learned",
      },
      {
        title: "Backtesting",
        href: "/backtesting",
        icon: History,
        description: "Does this strategy actually work",
      },
      {
        title: "Paper Trading",
        href: "/paper-trading",
        icon: Wallet,
        description: "Can this strategy be trusted",
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
        description: "Alert channels and preferences",
      },
      {
        title: "Administration",
        href: "/admin",
        icon: ShieldCheck,
        description: "Platform management",
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        description: "User preferences",
      },
    ],
  },
];

/** Flat list used for breadcrumbs and page titles. */
export const allNavItems: NavItem[] = navigation.flatMap((s) => s.items);
