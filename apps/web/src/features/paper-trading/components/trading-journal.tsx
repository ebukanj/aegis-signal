"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Star, Tag } from "lucide-react";
import type { JournalEntry, PaperTrade } from "../types";

export function TradingJournal({ journals, trades, className }: { journals: JournalEntry[], trades: PaperTrade[], className?: string }) {
  // Merge journals with basic trade info for context
  const entries = journals.map((j) => {
    const trade = trades.find(t => t.id === j.tradeId);
    return { ...j, trade };
  }).filter(j => j.trade !== undefined);

  if (!entries.length) {
    return (
      <Card className={`p-8 text-center text-muted-foreground ${className}`}>
        No journal entries found.
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {entries.map((entry) => (
        <Card key={entry.tradeId} className="p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold">{entry.trade!.coin}</span>
                <Badge variant={entry.trade!.outcome === "WIN" ? "default" : "destructive"}>
                  {entry.trade!.outcome}
                </Badge>
                <span className="text-sm text-muted-foreground">{entry.strategyUsed}</span>
              </div>
              <p className="text-sm text-muted-foreground">{new Date(entry.trade!.exitTime * 1000).toLocaleDateString()}</p>
            </div>
            <div className="flex text-yellow-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`size-4 ${i < entry.tradeRating ? "fill-current" : "text-muted opacity-30"}`} />
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-3">
              <div>
                <span className="font-semibold text-muted-foreground block mb-1">Reason for Entry</span>
                <p>{entry.reasonForEntry}</p>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground block mb-1">Lessons Learned</span>
                <p>{entry.lessonsLearned}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <span className="font-semibold text-muted-foreground block mb-1">Mistakes</span>
                {entry.mistakes.length > 0 ? (
                  <ul className="list-disc pl-4 text-destructive/90">
                    {entry.mistakes.map(m => <li key={m}>{m}</li>)}
                  </ul>
                ) : (
                  <p className="text-muted-foreground italic">None noted.</p>
                )}
              </div>
              <div>
                <span className="font-semibold text-muted-foreground block mb-1 flex items-center gap-1">
                  <Brain className="size-3"/> Psychology
                </span>
                <p>{entry.emotionNotes}</p>
              </div>
            </div>
          </div>

          {/* Footer Metadata */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              Confidence Before: <strong className="text-foreground">{entry.confidenceBefore}/10</strong>
            </div>
            <div className="flex items-center gap-1">
              Confidence After: <strong className="text-foreground">{entry.confidenceAfter}/10</strong>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Tag className="size-3" />
              {entry.tags.map(t => (
                <span key={t} className="bg-muted px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
