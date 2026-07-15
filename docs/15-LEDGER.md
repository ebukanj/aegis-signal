# The Outcome Ledger — The Permanent Memory

> The Strategy Evaluator asks: *"Does a setup exist?"*
> The Risk Engine asks: *"Should it exist?"*
> The Confidence Engine asks: *"How much trust has it earned?"*
> The Signal Engine asks: *"Is it worth publishing?"*
> The Outcome Ledger answers the one question that can never be revised:
> **"What actually happened?"**

Everything else in the platform is about the present. The ledger is about the
past, and it is the only part of the platform that is not allowed to change its
mind.

---

## 1. Signals are temporary. History is permanent.

The governing rule, and every design decision below descends from it:

> **The ledger never edits history.** A settled outcome is a matter of record.
> Corrections are appended as new events, never written over the old ones.

A track record you can quietly revise is not a track record — it is marketing with
a database behind it (06-STRATEGIES §5). This matters more here than anywhere,
because the ledger is the **single source of truth the Confidence Engine
calibrates against**. If it can be edited, every calibrated probability the
platform prints becomes a rumour. So the ledger is append-only, settlement happens
exactly once, and the enforcement lives in code where it can be tested — not in a
convention anyone can forget.

---

## 2. What it records, and why it records *everything*

The moment the Signal Engine publishes, the ledger registers the signal —
immutably, before it can trigger, while it is still nothing but a promise. And it
stores **everything**: the entry, stop and targets, the confidence, the confluence,
the risk, the regime, the calibration version, all frozen exactly as they were.

The reason is a rule: **no downstream engine should ever regenerate history.** If
the Confidence Engine had to re-run a strategy to calibrate, or the Track Record
had to re-read a chart to tally a win, that recreation could differ from what
actually happened — and then the platform would be learning from a fiction of its
own making. The past is *stored*, not recomputed. `settlement` is null while the
trade is open and set once, forever, when it closes.

---

## 3. Settlement — the market decides, not a human

Every track-record number, every calibration input, descends from one function:
the outcome calculator. So it obeys three rules.

**It is driven only by price.** *"Never rely on user input"* — a trader who says
they got out at breakeven is telling you about their trade, not the signal. The
ledger records the signal, and the signal's outcome is whatever the candles say.

**It is deterministic.** The same price path always settles the same way — no clock
reads inside the calculator, `now` is injected — so a replay of a day reproduces it
exactly. That is an acceptance criterion and also the only way the platform's own
history can be trusted.

**It is pessimistic where the data is ambiguous.** A single candle whose range
covers both a target and the stop tells us both traded, not in which order. **We
take the stop.** It is the honest reading when the data cannot say, and it is the
same rule the confidence labeller uses — so a "win" means the same thing to the
ledger and the calibration.

### What settlement computes

Beyond the outcome (WINNER / LOSER / PARTIAL / BREAKEVEN / EXPIRED / CANCELLED),
the R multiple, the PnL%, the holding time — and the two numbers most platforms
never record and most traders most need:

- **MFE** (maximum favourable excursion) — how far the trade ran *in your favour*
  before it closed. A winner that reached 2.8R and settled at 1R says the target
  was too far or the exit too slow.
- **MAE** (maximum adverse excursion) — how far it ran *against you* before it
  worked. A winner that first ran to −0.9R was a near-miss a slightly tighter stop
  would have turned into a loss.

Together they are how a strategy learns where its stops and targets actually
belong.

---

## 4. The audit trail — the history of the history

Every mutation appends a `LedgerAudit` row: `CREATED`, `TRIGGERED`, `SETTLED`. A
**correction is a new row, never an edit** to an old one. A record's whole life is
reconstructable in order, and none of it is ever overwritten. When someone tries to
settle an already-settled entry, the ledger **refuses** and appends a `CORRECTION`
note that the attempt was made — the refusal itself is part of the permanent
record.

---

## 5. The track record — allowed to be unimpressive, not allowed to be untrue

Built from settled outcomes only: win rate, expectancy, profit factor, average R,
drawdown, streaks, per-strategy stats, and four performance curves (equity,
win-rate, expectancy, drawdown). The one dishonest move available — letting a tiny
sample pose as a record — is refused by the **`basis`** field:

- `NO_DATA` — nothing has settled.
- `PROVISIONAL` — some history, not yet enough to believe (< 30 settled).
- `ESTABLISHED` — enough to mean something.

Sharpe and Sortino are named FUTURE in the spec and left there: they need a returns
series over calendar time the platform has not accumulated, and a Sharpe over
eleven trades is noise wearing a Greek letter.

---

## 6. Historical replay — boring on purpose

In most systems, replaying history means re-running a simulation and hoping it
lands where it did before. Here it *cannot drift*, because history is not simulated
— it is stored. Replay is a pure, deterministic re-read of the ledger through the
same statistics engine the live track record uses, for any slice: one signal, one
strategy, one symbol, one regime, a date range. That the replay is unable to
surprise you is the feature.

---

## 7. This is what makes the feed LIVE

The owner's requirement: a missed or stopped signal must leave the feed on its own,
not on a refresh. The **Settlement Worker** is the heartbeat that delivers it.
Every 30 seconds it walks every open signal, fetches the price path, and asks the
calculator what happened. When a trade resolves — a target hit, a stop hit, a setup
that ran past its entry and never triggered, an expiry — the ledger settles it
(immutably), the signal advances to a terminal lifecycle state, and it drops out of
the feed's query. A tiny `signals:changed` nudge goes out over the socket; the
browser refetches, re-ranks, and the settled signal is gone. No polling, no manual
refresh.

It only settles the **definitive** — a trade that has genuinely resolved or whose
horizon has fully elapsed. An open trade that simply hasn't resolved yet is left
open, because settlement is immutable and a premature close could never be undone.

---

## 8. Verified on real history

The ledger reconciled and settled the platform's 48 published signals from their
real replayed outcomes, and built its first track record:

```
48 settled · 14 winners · win rate 29.2%
expectancy −0.27R · total −13R · profit factor 0.62
longest win streak 3 · longest loss streak 9 · 465 tracking days
basis ESTABLISHED

Breakout   47 signals · 14 wins · −0.26R expectancy
Reversal    1 signal  ·  0 wins · −1.00R
```

This is the ledger doing its job: **Breakout, as written, loses money** over 465
days of real history — a 29% win rate at a 1.5R first target does not clear the ~40%
it needs to break even. The platform is not hiding it behind a chart; it is
recording it, plainly, so that ADR-024's auto-disable logic can eventually act on
it and the Confidence Engine can calibrate against the truth. A track record that
only reported the good runs would be the same lie as a random 91%.

`14` ledger tests · `600` API tests · `112` contract tests — all green.

---

## 9. Out of scope

News, social sentiment, AI insights, notification delivery, frontend analytics,
portfolio management. The ledger's responsibility ends after creating a permanent,
immutable historical truth. What is *done* with that truth — calibration,
strategy evolution, the public scoreboard — belongs to the engines around it.

**One honest limit:** the feed's *content* today is the historical corpus; true
always-fresh signals need a continuous scan worker firing on each closed bar, which
is not yet built. The *liveness* — settlement, removal, re-ranking — is real and
wired; it simply has few current open signals to act on until that worker exists.
