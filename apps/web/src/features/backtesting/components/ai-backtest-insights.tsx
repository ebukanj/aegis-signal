"use client";

import { Brain, TrendingUp, AlertTriangle, Lightbulb, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BacktestResult } from "../types";

interface AIBacktestInsightsProps {
  insights: BacktestResult["aiInsights"];
  className?: string;
}

/**
 * Displays AI-generated analysis of the backtest results.
 * Includes strengths, weaknesses, best markets, and optimization suggestions.
 */
export function AIBacktestInsights({ insights, className }: AIBacktestInsightsProps) {
  return (
    <Card className={className}>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <CardTitle className="flex items-center text-lg">
          <Brain className="mr-2 size-5 text-primary" />
          AI Backtest Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
        
        {/* Strengths */}
        <div className="space-y-3">
          <h4 className="flex items-center text-sm font-semibold text-success">
            <TrendingUp className="mr-2 size-4" />
            Key Strengths
          </h4>
          <ul className="space-y-2">
            {insights.strengths.map((s, i) => (
              <li key={i} className="text-sm text-muted-foreground pl-6 relative">
                <span className="absolute left-2 top-1.5 size-1.5 rounded-full bg-success/50" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="space-y-3">
          <h4 className="flex items-center text-sm font-semibold text-destructive">
            <AlertTriangle className="mr-2 size-4" />
            Vulnerabilities
          </h4>
          <ul className="space-y-2">
            {insights.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-muted-foreground pl-6 relative">
                <span className="absolute left-2 top-1.5 size-1.5 rounded-full bg-destructive/50" />
                {w}
              </li>
            ))}
          </ul>
        </div>

        {/* Optimal Conditions */}
        <div className="space-y-3">
          <h4 className="flex items-center text-sm font-semibold text-foreground">
            <MapPin className="mr-2 size-4 text-muted-foreground" />
            Optimal Market Conditions
          </h4>
          <div className="flex flex-wrap gap-2">
            {insights.bestMarkets.map((m, i) => (
              <span key={i} className="inline-flex items-center rounded-md border bg-muted/50 px-2.5 py-0.5 text-xs font-semibold">
                {m.replace("_", " ")}
              </span>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="space-y-3">
          <h4 className="flex items-center text-sm font-semibold text-primary">
            <Lightbulb className="mr-2 size-4" />
            Optimization Suggestions
          </h4>
          <ul className="space-y-2">
            {insights.optimizationSuggestions.map((o, i) => (
              <li key={i} className="text-sm text-muted-foreground pl-6 relative">
                <span className="absolute left-2 top-1.5 size-1.5 rounded-full bg-primary/50" />
                {o}
              </li>
            ))}
          </ul>
        </div>

      </CardContent>
    </Card>
  );
}
