import type { IRiskValidator } from "../../domain/validator";

import {
  candidateIntegrityValidator,
  derivativesValidator,
  exchangeHealthValidator,
  freshnessValidator,
  newsValidator,
  portfolioHeatValidator,
} from "./integrity.validators";

import {
  liquidityValidator,
  spreadValidator,
  volatilityValidator,
} from "./market.validators";

import { regimeValidator } from "./regime.validator";

import {
  correlationValidator,
  riskRewardValidator,
  stopQualityValidator,
  structureValidator,
} from "./trade.validators";

/**
 * Every gate, in the order they run — and **the order is the message**.
 *
 * It is not an optimisation. A trader reading a rejection must see the most FUNDAMENTAL
 * reason the trade died, not whichever one an arbitrary loop happened to reach first.
 *
 * "Rejected: R:R is 1.2" is a useless thing to tell somebody whose exchange is down.
 *
 * So:
 *
 *   1. **Is this even a real trade?**   Is the candidate coherent? Is the exchange alive?
 *                                        Is the evidence still true? A NO here is a bug
 *                                        upstream, not a market judgement.
 *
 *   2. **Can this market be traded?**   Liquidity, spread, volatility. Questions about the
 *                                        market, answerable without looking at the trade.
 *
 *   3. **Should this market be traded?** Regime, and whether the bigger charts agree.
 *
 *   4. **Is this a good trade?**         R:R, the stop, the structure it is entering into,
 *                                        what it correlates with. The trade's own merits —
 *                                        the last thing worth asking, and the first thing
 *                                        most platforms ask.
 *
 *   5. **What could we not see?**        News, portfolio, derivatives. These never veto,
 *                                        and they are never silent.
 */
export const ALL_VALIDATORS: IRiskValidator[] = [
  // 1 — is this a real trade, about a market we can actually see?
  candidateIntegrityValidator,
  exchangeHealthValidator,
  freshnessValidator,

  // 2 — can this market be traded at all?
  liquidityValidator,
  spreadValidator,
  volatilityValidator,

  // 3 — should it be?
  regimeValidator,

  // 4 — is the trade itself any good?
  riskRewardValidator,
  stopQualityValidator,
  structureValidator,
  correlationValidator,

  // 5 — and what did nobody look at?
  newsValidator,
  portfolioHeatValidator,
  derivativesValidator,
];

/* ── The gates history can actually answer ─────────────────────────── */

/**
 * The subset of gates the confidence engine's historical replay may run.
 *
 * ── Why a subset exists at all, stated bluntly ──
 *
 * **Binance does not sell you the order book of March 2024.** Spread, depth,
 * exchange latency and funding are not recoverable from historical candles — they
 * were never stored, by anyone, and no amount of engineering will conjure them.
 *
 * So a replay cannot run the microstructure gates. It has two options, and only
 * one of them is honest:
 *
 *   1. Synthesise a plausible spread and depth, and let the gates run. This
 *      produces a complete-looking corpus built partly on fabricated inputs, and
 *      every number downstream inherits the fabrication while looking exactly like
 *      a measurement. **Refused.**
 *   2. Run only the gates whose inputs actually exist, and say plainly what the
 *      corpus therefore is not.
 *
 * We take the second.
 *
 * ── What that means, and it is not nothing ──
 *
 * The historical corpus is a corpus of setups that passed the CANDLE-COMPUTABLE
 * gates. It contains setups that a live spread or liquidity gate would have
 * vetoed, because in March 2024 nobody recorded whether it would have. Live
 * signals are therefore gated MORE strictly than the corpus was.
 *
 * That is a real limitation and it is written into docs/13-CONFIDENCE.md rather
 * than buried here. The direction of the bias is at least the safe one: the corpus
 * includes marginal setups that live trading would have refused, so if anything it
 * understates what the surviving live signals are worth. It does not overstate it.
 *
 * The correct fix is to record the book going forward, so that in two years the
 * corpus is complete. That is the only fix, and it takes two years.
 */
export const HISTORICALLY_REPLAYABLE: readonly IRiskValidator[] = [
  candidateIntegrityValidator,
  volatilityValidator,
  regimeValidator,
  riskRewardValidator,
  stopQualityValidator,
  structureValidator,
];

/**
 * The gates that need a live market, and can never be replayed.
 *
 * Every validator must appear in exactly one of these two lists. A test enforces
 * it — so a gate added later cannot be silently skipped by the replay, which would
 * shift the corpus's score distribution away from the live one and quietly
 * invalidate every calibrated probability the platform prints.
 */
export const REQUIRES_LIVE_MARKET: readonly IRiskValidator[] = [
  exchangeHealthValidator,
  freshnessValidator,
  liquidityValidator,
  spreadValidator,
  correlationValidator,
  newsValidator,
  portfolioHeatValidator,
  derivativesValidator,
];
