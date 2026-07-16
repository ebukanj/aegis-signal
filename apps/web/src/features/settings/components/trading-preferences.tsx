"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { authApi } from "@/features/auth/api/auth-api";

/**
 * Trading preferences — LIVE (M16). The two numbers the position calculator
 * pre-fills for every signal: your equity and the percentage of it one trade may
 * risk. Stored with your account, not the browser — sign in anywhere and they
 * follow you.
 */
export function TradingPreferencesView() {
  const queryClient = useQueryClient();

  const prefs = useQuery({
    queryKey: ["preferences"],
    queryFn: () => authApi.getPreferences(),
  });

  const [equity, setEquity] = useState("");
  const [risk, setRisk] = useState("");

  useEffect(() => {
    if (prefs.data) {
      setEquity(String(prefs.data.accountEquity));
      setRisk(String(prefs.data.riskPerTrade));
    }
  }, [prefs.data]);

  const save = useMutation({
    mutationFn: () =>
      authApi.updatePreferences({
        accountEquity: Number(equity),
        riskPerTrade: Number(risk),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["preferences"], updated);
      toast.success("Trading preferences saved.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not save preferences."),
  });

  const valid = Number(equity) > 0 && Number(risk) > 0 && Number(risk) <= 100;

  return (
    <div className="animate-in fade-in zoom-in-95 space-y-6 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Trading Preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Position-sizing defaults, pre-filled on every signal&apos;s calculator.
        </p>
      </div>

      {prefs.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card className="max-w-xl space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="pref-equity">Account equity (USD)</Label>
            <Input
              id="pref-equity"
              type="number"
              min="1"
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The capital your position sizes are computed from.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pref-risk">Risk per trade (%)</Label>
            <Input
              id="pref-risk"
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How much of your equity one stopped-out trade may cost. 1–2% is the
              discipline most professionals keep.
            </p>
          </div>

          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save preferences
          </Button>
        </Card>
      )}
    </div>
  );
}
