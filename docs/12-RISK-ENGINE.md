# The Risk Engine — The Veto

> The Strategy Evaluator asks: *"Is there an opportunity?"*
> The Risk Engine asks: **"Should this opportunity be allowed to exist?"**

It does not find trades. It exists to **reject** them. Its authority is absolute:
**if it says no, the platform says no**, and no engine downstream may overrule it.

Its power to refuse is not an obstacle to the product. **It IS the product** (AGENTS.md §1).

> **A missed trade is acceptable. A bad trade is not.**
> Those two costs are not symmetric, and every threshold in `risk.policy.ts` errs toward
> silence because of it.

---

## 1. The question it answers, and the four it refuses to

It answers exactly one: *"Is this trade acceptable?"*

It never searches for trades. It never modifies a strategy. It never adjusts confidence.
It never changes an entry.

And — the one worth stating twice — **it never silently moves a bad stop.**

### The Risk Engine produces decisions, not edits

The engine *could* widen a too-tight stop to 1.5 ATR and let the trade through. More
signals would survive. It doesn't, because then the trade the trader takes is **not the
trade the document described** — the strategy's track record would be credited for a stop
it never chose, and calibration (ADR-024) would be measuring a hybrid nobody wrote: half
strategy, half engine, accountable to neither.

A bad stop is **vetoed**, with the measurement.

---

## 2. "If uncertain, reject" — and the line that makes it workable

The brief says: *if the Risk Engine is uncertain, it must reject.* Taken literally, that
would veto every trade forever — because several gates it demands **cannot see anything
yet**. There is no news engine (M09), no ledger, no derivatives feed.

So the engine draws a line, and the line is the answer:

| | Behaviour |
|---|---|
| **A feed that was never BUILT** (news, portfolio heat, funding) | Reports `UNASSESSED`. **Does not veto.** Named, in plain English, and travels with the decision to the trader. |
| **A feed that SHOULD be there and is dark** (exchange down, no order book, stale candles) | **VETOES.** Absent data that ought to be present is itself a risk signal. |

**A missing measurement must read as missing, never as fine** — the contract's own words.

An approval that says *"nobody checked whether CPI prints in ten minutes"* is honest. An
approval that quietly did not check is **a lie with a green tick on it**.

Every unassessed factor is marked `available: false` and rated **ELEVATED**, never LOW. An
unknown risk is not a small one, and it must never make a trade look safer than one whose
risks were actually measured.

---

## 3. The pipeline — and the order is the message

Every gate runs. The pipeline does **not** short-circuit: it costs microseconds and buys
the complete picture. The **first** veto is the decision; the rest are the diagnosis.

The order is not an optimisation. A trader reading a rejection must see the most
**fundamental** reason it died — *"Rejected: R:R is 1.2"* is a useless thing to tell
somebody whose exchange is down.

| # | Question | Gates |
|---|---|---|
| 1 | **Is this even a real trade?** | candidate integrity · exchange health · freshness |
| 2 | **Can this market be traded?** | liquidity · spread · volatility |
| 3 | **Should it be?** | regime · higher-timeframe conflict |
| 4 | **Is the trade any good?** | R:R · stop quality · structure · correlation |
| 5 | **What could nobody see?** | news · portfolio · derivatives |

Most platforms ask #4 first, and never ask #1 or #5 at all.

---

## 4. The gates worth arguing about

### Spread — the gate most platforms do not have

An edge of 0.3% behind a spread of 0.08% is an edge that is **gone before the trade
begins**. You pay it on the way in and again on the way out — so it is a 0.16% tax on a
move you hoped would make 0.3%, and more than half the profit was never yours.

**It never appears in a backtest.** Backtests fill at the close, for free, on both sides.
It is one of the largest single reasons a strategy that works on paper does not work with
money.

*A missing order book is a VETO.* "We could not check" is not a reason to proceed.

### Stop quality — a stop inside the noise is a donation

If the instrument routinely swings 1 ATR in a bar, a stop 0.3 ATR away is taken out by the
market **doing nothing in particular**. The trade never gets the chance to be right or
wrong — and the loss is still attributed to the strategy, whose record is then *wrong*.

The other end matters too: a stop 9 ATR away cannot be hit by noise because it cannot be
hit by anything short of the thesis being comprehensively wrong. **That is hope with a
price attached.**

### R:R has a MAXIMUM, which surprises people

A 40R target is not ambition. R is a **ratio**, and a ratio can be inflated from either
end — a spectacular R:R is nearly always a suspiciously **tight stop** rather than a
spectacular target. This is one of the few places a platform can catch itself flattering
its own numbers.

*Measured on the FIRST target*, not the last. The last is a hope; the first is the one that
actually gets hit and pays for the losers.

### Volatility — the expansion matters more than the level

A market that has *always* been volatile can be traded with a wide stop. A market whose
volatility has just **tripled** is a market whose behaviour changed *since the strategy's
conditions were evaluated* — the stop the document proposed was sized for a world that no
longer exists.

The baseline is a **median** taken from a window that ends **before** the present. (M06
learned this the hard way: twenty bars into a crash, a naive baseline *is* the crash.)

### Regime — checked AGAIN, on purpose

The Strategy Evaluator already gated on regime. This is not redundancy, it is **defence in
depth**. The Risk Engine's guarantee is unconditional — *nothing reaches a trader that this
engine did not check* — and that guarantee **cannot depend on an upstream engine having
done its job.** The cost of checking twice is microseconds. The cost of trusting once is an
account.

---

## 5. Sizing — risk is defined by the STOP, never by the leverage

```
quantity = (equity × risk%) / |entry − stop|
```

**Leverage appears nowhere in that formula**, and its absence is the entire discipline.
Leverage decides only how much margin you post; it has no bearing on how much you lose when
the stop is hit, because *the stop decides that*.

A trader who sizes by leverage — *"I'll go 10x"* — has no idea what they stand to lose. They
have chosen a margin requirement and left the loss to be determined by wherever the stop
happens to sit. That is not a style difference. **It is the mechanism by which accounts
die.**

### Liquidation must NEVER precede the stop

The most expensive mistake in leveraged trading, and most platforms will cheerfully let a
user make it. At high enough leverage **the exchange closes the position before price ever
reaches the stop** — so the trade is never proven wrong, the risk management never runs, and
the account is gone. The trader did everything right, set a sensible stop, and lost anyway.

The contract refuses to even **represent** such a recommendation (`liquidationBeforeStop`
must be false). The engine walks leverage *down* from the cap and takes the first level
where liquidation clears the stop by the policy's buffer (1.5R). If **no** leverage is safe,
it **vetoes** — it does not ship a dangerous one.

Maintenance margin is deliberately **over-estimated**, so every error lands on the side of
less leverage.

---

## 6. Risk is not confidence

A risk score of 21 does **not** mean the trade wins 79% of the time.

It means the *conditions around* the trade are clean — the book is deep, the spread is
tight, the regime fits, the stop is sane. A brilliant setup in a terrible market and a
mediocre setup in a perfect one are **different questions**, and this answers only the
second.

The headline **level** takes the **worst** available factor, never the average. A trade with
excellent liquidity, an excellent spread and a stop sitting inside the noise is not a
"mostly good" trade — averaging would let the two strong factors carry the fatal one, and
the fatal one is what empties the account.

---

## 7. The policy — every limit in one place, none hardcoded

*"Policies must be externalized. Never hardcode limits."* The brief is right, and not for
configurability's own sake:

**A threshold buried in a validator is a threshold nobody can audit.** When the platform
rejects a trade for a spread of 0.081%, a trader is entitled to see the number it was
measured against — and an operator is entitled to change it without a deploy. A limit that
only exists inside an `if` will one day differ from the one the documentation claims.

Every number in `risk.policy.ts` is a **trade-off**, and each states what it costs.

A **self-contradicting** policy is refused at boot. One demanding an R:R of at least 3 and
at most 2 would reject every candidate — silently, for a reason nobody could ever find, and
every rejection would look individually reasonable.

*There is a test proving the limits are real: tighten one, and the same trade dies.*

---

## 8. Account equity, until Milestone 11

There is no user account yet, and **a position size without an equity is not a position
size** — it is a percentage pretending to be an answer.

So the policy carries a **reference equity** ($10,000, env-overridable), every sizing states
what it assumed, and the number is honest **because it declares its own basis**. When Users
lands, the value comes from the trader's settings and one line changes.

---

## 9. Verified on live BTC

Real Binance data — real spread, real near-touch depth, real ATR, real zones:

```
BTC $64,544   ATR(14) $404 (0.63%)   spread 0.0002%   24h vol $11.7B
depth $4.2M   regime TRENDING_BULL / EXPANDED   41 zones
```

| Trade | Verdict |
|---|---|
| **Stop 2 ATR, 3R target** | **APPROVED** — risk 18/100, **5×**, liquidation $52,281 sits **14.2R beyond the stop**. Size 0.1237 BTC ($7,982 notional) risking **$100 of $10,000**. |
| Stop 0.3 ATR | **VETOED** `STOP_QUALITY` — *"inside the noise this instrument routinely produces, so it would be taken out by the market doing nothing at all"* |
| Stop 9 ATR | **VETOED** `STOP_QUALITY` — *"hope, not risk management"* |
| 1.1R reward | **VETOED** `RISK_REWARD` — *"must win more than 48% of the time simply to break even before fees, and not one strategy here has yet earned the right to claim any win rate at all"* |
| Stop = entry | **VETOED** `INVALID_CANDIDATE` — *"divides by zero and produces an infinite position size"* |

And the approval **named the three risks nobody checked**: no news feed, no ledger, no
derivatives feed.

Note the approval is rated **ELEVATED** despite a low score of 18 — volatility was running
1.7× its recent normal, and the level takes the worst factor.

---

## 10. Out of scope

Confidence scoring · Prime budget · publication · notifications · AI commentary · portfolio
management.

**The Risk Engine's responsibility ends after issuing its decision.**

No engine after this milestone may receive a candidate that has not been approved or
explicitly rejected here.
