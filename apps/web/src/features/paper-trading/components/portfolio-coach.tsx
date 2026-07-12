import { Card } from "@/components/ui/card";
import { Bot, Lightbulb, AlertTriangle, TrendingUp } from "lucide-react";

export function PortfolioCoach({ className }: { className?: string }) {
  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-full text-primary">
          <Bot className="size-6" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">AI Portfolio Coach</h3>
          <p className="text-sm text-muted-foreground">Continuous monitoring and personalized advice</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="mt-0.5 text-warning">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Position Sizing Warning</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Your recent ETH short is sized at 3x your average risk parameters. Given the current bullish market regime, consider scaling out 50% to align with your risk profile.
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <div className="mt-0.5 text-success">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Strategy Outperformance</h4>
            <p className="text-sm text-muted-foreground mt-1">
              The &lsquo;Chameleon&rsquo; strategy has contributed 60% of your total returns this month. You have a high win rate (68%) when trading BTC with this strategy during the European session.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="mt-0.5 text-primary">
            <Lightbulb className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Psychology Note</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Your journal indicates recurring &ldquo;FOMO&rdquo; entries after sudden wicks. I recommend implementing a hard 15-minute cool-off period after a 2% 1-minute candle before executing manual trades.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
