"use client";

import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/features/auth/stores/auth-store";

/**
 * Profile — the real account, from the real session. Nothing here is editable
 * yet by design: the platform stores exactly what it needs (a name, an email, a
 * role) and invents nothing else — no phone numbers, no bios, no avatars that
 * would exist only to look filled-in.
 */
export function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your account, as the platform knows it.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary/15 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <Badge variant={user.role === "TRADER" ? "secondary" : "default"} className="gap-1 text-[10px]">
                {user.role !== "TRADER" && <ShieldCheck className="size-3" />}
                {user.role}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Member since {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        To change your password, use <span className="font-medium text-foreground">Security</span>.
        Trading defaults live under <span className="font-medium text-foreground">Trading Preferences</span>.
      </p>
    </div>
  );
}
