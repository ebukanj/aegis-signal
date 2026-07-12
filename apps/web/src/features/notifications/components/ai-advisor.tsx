import { Card } from "@/components/ui/card";
import { Bot, AlertTriangle, Lightbulb, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AIAdvisor() {
  return (
    <Card className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 text-primary rounded-md">
          <Bot className="size-5" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">AI Notification Advisor</h3>
          <p className="text-sm text-muted-foreground">Smart suggestions to optimize your attention.</p>
        </div>
      </div>

      <div className="space-y-6 flex-1">
        <div className="flex gap-3">
          <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Notification Fatigue Detected</h4>
            <p className="text-sm text-muted-foreground mt-1">
              You are receiving an average of 42 alerts per day. Consider increasing your &ldquo;Minimum Confidence&rdquo; filter from 60% to 75% to reduce noise.
            </p>
            <Button variant="link" className="px-0 h-auto text-xs mt-2">Apply filter optimization →</Button>
          </div>
        </div>

        <div className="flex gap-3">
          <BellOff className="size-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Redundant Delivery Paths</h4>
            <p className="text-sm text-muted-foreground mt-1">
              You have both Telegram and Browser push enabled for NEW_SIGNAL events. To reduce duplicate cognitive load, disable Browser notifications for these alerts.
            </p>
            <Button variant="link" className="px-0 h-auto text-xs mt-2 text-destructive">Disable redundant channels →</Button>
          </div>
        </div>

        <div className="flex gap-3">
          <Lightbulb className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Channel Reliability</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Telegram has a 100% delivery success rate and 0ms latency for you over the last 30 days. It is recommended to use Telegram as your primary CRITICAL alert channel.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
