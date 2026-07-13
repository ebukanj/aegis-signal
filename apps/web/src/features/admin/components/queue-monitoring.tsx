import { Card } from "@/components/ui/card";
import { Layers, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { QueueStatus } from "../types";

export function QueueMonitoring({ queues }: { queues: QueueStatus[] }) {
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Queue Monitoring</h2>
        <p className="text-muted-foreground text-sm mt-1">Real-time status of BullMQ task queues.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {queues.map(queue => (
          <Card key={queue.id} className="p-6 space-y-6">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="bg-primary/10 p-2 rounded-md">
                <Layers className="size-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">{queue.name}</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                  <span className="size-2 rounded-full bg-warning"></span> Waiting
                </div>
                <div className="text-2xl font-numeric font-bold">{queue.waiting.toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                  <Loader2 className="size-3 text-primary animate-spin" /> Processing
                </div>
                <div className="text-2xl font-numeric font-bold">{queue.processing.toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="size-3 text-success" /> Completed
                </div>
                <div className="text-xl font-numeric">{queue.completed.toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                  <XCircle className="size-3 text-destructive" /> Failed
                </div>
                <div className="text-xl font-numeric text-destructive">{queue.failed.toLocaleString()}</div>
              </div>
            </div>

            <div className="pt-4 border-t flex justify-between items-center text-xs text-muted-foreground">
              <span>Retries: {queue.retries.toLocaleString()}</span>
              <a href="#" className="text-primary hover:underline">View Jobs →</a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
