"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { allNavItems } from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * Path-derived breadcrumbs. The first segment resolves against workspace
 * navigation; deeper segments render as readable labels. Hidden on the
 * workspace root (the topbar title already covers it).
 */
export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const workspace = allNavItems.find((i) => i.href === `/${segments[0]}`);

  const crumbs = [
    { label: workspace?.title ?? humanize(segments[0]), href: `/${segments[0]}` },
    ...segments.slice(1).map((segment, index) => ({
      label: humanize(segment),
      href: `/${segments.slice(0, index + 2).join("/")}`,
    })),
  ];

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3" aria-hidden />}
              {isLast ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function humanize(segment: string): string {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
