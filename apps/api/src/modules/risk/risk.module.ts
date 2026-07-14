import { Module } from "@nestjs/common";
import { RiskService } from "./application/services/risk.service";
import { RiskPipeline } from "./application/services/risk.pipeline";
import { SizingService } from "./application/services/sizing.service";

/**
 * THE RISK ENGINE — the veto.
 *
 * It does not find opportunities. It exists to REJECT BAD TRADES, and its authority is
 * absolute: **if it says no, the platform says no.** No engine downstream may overrule it,
 * and none is given the chance — nothing reaches a trader that has not passed through here.
 *
 * ── The half that makes everything above it worth trusting ──
 *
 * Six engines produce evidence. This one produces a decision, and its power to say NO is
 * not an obstacle to the product — **it IS the product** (AGENTS.md §1). "Protect the
 * Trader" is this module, expressed as code.
 *
 * A missed trade is acceptable. A bad trade is not. Those two costs are not symmetric, and
 * every threshold in `risk.policy.ts` errs toward silence because of it.
 *
 * ── What it will never do ──
 *
 * It never searches for trades. It never modifies a strategy. It never adjusts confidence.
 * It never changes an entry. And — the one worth stating twice — **it never silently moves
 * a bad stop.** It vetoes it. Moving it would hand the trader a trade the strategy never
 * proposed, and the strategy's record would then be earned by rules that never ran.
 *
 * It produces decisions, not edits.
 */
@Module({
  providers: [SizingService, RiskPipeline, RiskService],
  exports: [RiskService],
})
export class RiskModule {}
