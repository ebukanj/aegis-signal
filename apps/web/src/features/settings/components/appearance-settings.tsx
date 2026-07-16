"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Appearance — the one visual preference that is real: the theme. Persisted by
 * next-themes and applied instantly. (Density toggles and layout presets were
 * mock switches that saved nothing; they are gone until they do something.)
 */
export function AppearanceSettingsView() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { id: "light", label: "Light", icon: Sun, hint: "Bright rooms" },
    { id: "dark", label: "Dark", icon: Moon, hint: "The trading desk default" },
    { id: "system", label: "System", icon: Monitor, hint: "Follow the OS" },
  ] as const;

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">How Aegis Signal looks on this device.</p>
      </div>

      <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          const active = mounted && theme === option.id;
          return (
            <Card
              key={option.id}
              role="button"
              tabIndex={0}
              onClick={() => setTheme(option.id)}
              onKeyDown={(e) => e.key === "Enter" && setTheme(option.id)}
              className={cn(
                "cursor-pointer p-5 transition-colors",
                active ? "border-primary/60 bg-primary/[0.05]" : "hover:border-primary/30",
              )}
            >
              <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
              <h3 className="mt-3 text-sm font-semibold">{option.label}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
