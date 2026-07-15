import { Injectable } from "@nestjs/common";
import type { RejectionGate } from "@aegis/contracts";
import type { SignalPolicy } from "../../signal.policy";
import type { SignalCandidate } from "../../domain/intake";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

export type FreshnessVerdict =
  | { fresh: true }
  | { fresh: false; gate: RejectionGate; reason: string };

/**
 * Is the opportunity still real, or has the market moved on?
 *
 * ── A signal must never outlive the conditions that created it ──
 *
 * This is the quietest failure a signal product can have and one of the most
 * damaging. A setup fires, the pipeline takes a few bars to grind through risk and
 * confidence and confluence, and by the time it would publish, price has already
 * run to the target or broken the stop — and the platform publishes it anyway,
 * telling a trader to enter a trade that no longer exists. The entry is stale, the
 * R:R the signal promised is gone, and the trader chases or gets stopped
 * immediately.
 *
 * The Risk Engine already guards staleness at the candidate level (M08). This is
 * the publication-time backstop: the last check before a signal reaches a trader,
 * asking not "was the evidence fresh when it was evaluated?" but "is it STILL fresh
 * now, at the moment we are about to publish?"
 */
@Injectable()
export class FreshnessService {
  check(intake: SignalCandidate, policy: SignalPolicy): FreshnessVerdict {
    const barMs = timeframeMs(intake.candidate.timeframe);

    /*
     * Bars elapsed BEYOND the candidate's own closing bar. The bar it fired on has
     * closed by definition, so one bar of age is not staleness — it is how a closed
     * candle works. Age is counted from there.
     */
    const ageBars = Math.floor((intake.now - intake.candidate.barTime) / barMs) - 1;

    if (ageBars > policy.maximumAgeBars) {
      return {
        fresh: false,
        gate: "STALE_DATA",
        reason:
          `the setup is ${ageBars} bars old (limit ${policy.maximumAgeBars}) — ` +
          `this describes a market that has already moved, and its entry, stop and targets belong to a world that no longer exists`,
      };
    }

    return { fresh: true };
  }
}
