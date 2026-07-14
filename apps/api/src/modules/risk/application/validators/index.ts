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
