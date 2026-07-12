"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dice5, AlertCircle } from "lucide-react";

/**
 * UI Placeholder for the future Monte Carlo simulation engine.
 */
export function MonteCarloPlaceholder({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Dice5 className="mr-2 size-5 text-muted-foreground" />
          Monte Carlo Simulation
        </CardTitle>
        <CardDescription>
          Probabilistic stress-testing and future outcome distribution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-[250px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 text-center p-6">
          <AlertCircle className="mb-4 size-8 text-muted-foreground/50" />
          <h4 className="text-sm font-semibold text-foreground">Engine in Development</h4>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            The Monte Carlo simulation engine is currently being built by the Quantitative Engineering team. 
            When available, this panel will display probability distributions, expected drawdowns, and confidence bands generated across 10,000 synthetic runs.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
