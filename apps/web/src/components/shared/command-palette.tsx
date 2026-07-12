"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { navigation } from "@/config/navigation";

/**
 * Global command palette (Ctrl/⌘ + K).
 * Currently navigates between workspaces; future milestones extend it with
 * coins, signals, and strategies without changing this surface.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* Search affordance shown in the topbar (icon-only below lg) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl+K)"
        className="lg:hidden"
      >
        <Search />
      </Button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl+K)"
        className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left text-xs">Search…</span>
        <kbd className="font-numeric rounded border bg-muted px-1.5 py-0.5 text-[10px]">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search workspaces…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {navigation.map((section) => (
            <CommandGroup key={section.label} heading={section.label}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.title} ${item.description}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon />
                  <span>{item.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
