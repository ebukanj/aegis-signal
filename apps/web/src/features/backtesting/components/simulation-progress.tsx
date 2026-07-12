"use client";

import { useBacktestingStore } from "@/stores/backtesting-store";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASES = [
  { id: "PREPARING_DATA", label: "Preparing historical data" },
  { id: "RUNNING_STRATEGY", label: "Executing strategy logic" },
  { id: "CALCULATING_METRICS", label: "Calculating performance metrics" },
  { id: "BUILDING_REPORT", label: "Generating backtest report" },
  { id: "COMPLETED", label: "Simulation complete" },
] as const;

/**
 * Visual progress stepper and progress bar during backtest execution.
 * Appears below the configuration form when a backtest is running.
 */
export function SimulationProgress() {
  const simulation = useBacktestingStore((s) => s.simulation);

  if (simulation.phase === "IDLE") {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed bg-muted/20">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
          <Play className="size-5 fill-current" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">Ready to Execute</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Configure parameters above and run the simulation to validate strategy performance against historical data.
        </p>
      </Card>
    );
  }

  if (simulation.phase === "FAILED") {
    return (
      <Card className="border-destructive/50 bg-destructive/5 p-6">
        <h3 className="text-sm font-semibold text-destructive">Simulation Failed</h3>
        <p className="text-sm text-muted-foreground">{simulation.message}</p>
      </Card>
    );
  }

  // Determine current active index
  let currentIndex = PHASES.findIndex((p) => p.id === simulation.phase);
  if (currentIndex === -1) currentIndex = PHASES.length; // COMPLETED

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Running Simulation</h3>
          <p className="text-xs text-muted-foreground">{simulation.message}</p>
        </div>
        <span className="font-numeric text-xl font-semibold">{simulation.progress}%</span>
      </div>

      {/* Progress Bar */}
      <div className="mb-8 relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out"
          style={{ width: `${simulation.progress}%` }}
        />
      </div>

      {/* Stepper */}
      <div className="flex justify-between">
        {PHASES.map((phase, i) => {
          const isCompleted = i < currentIndex || simulation.phase === "COMPLETED";
          const isActive = i === currentIndex;
          const isPending = i > currentIndex;

          return (
            <div key={phase.id} className="flex flex-col items-center flex-1 text-center">
              <div className={cn(
                "flex size-6 items-center justify-center rounded-full mb-2 bg-background z-10 ring-4 ring-card",
                isCompleted ? "text-success" : isActive ? "text-primary" : "text-muted-foreground opacity-30"
              )}>
                {isCompleted ? (
                  <CheckCircle2 className="size-5" />
                ) : isActive ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Circle className="size-4" />
                )}
              </div>
              <span className={cn(
                "text-[10px] sm:text-xs font-medium max-w-[80px] leading-tight",
                isCompleted ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground opacity-50"
              )}>
                {phase.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
