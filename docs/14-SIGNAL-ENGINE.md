# The Signal Engine — The Publisher

> The Strategy Evaluator asks: *"Does the setup exist?"*
> The Risk Engine asks: *"Is the setup acceptable?"*
> The Confidence Engine asks: *"How much trust has this setup earned?"*
> The Signal Engine asks the final question: **"Is this one of the few
> opportunities worthy of interrupting the trader?"**

It is not another analysis engine. It is the **Editor-in-Chief**. Everything before
it prepared evidence; this decides what to print. And most of the time, the answer
is **no** — Aegis Signal is a signal *filter*, not a signal generator (AGENTS.md
§1).

---

## 1. It orchestrates. It never analyses.

This is the whole architectural discipline of the milestone, and it is worth
stating as a prohibition:

> The Signal Engine **never** recomputes an indicator, re-detects a pattern,
> re-runs the risk gates, or re-scores confidence.

Every number in a published signal was produced by the engine that owns it — the
entry, stop and targets by the Strategy Evaluator and approved by the Risk Engine;
the leverage and market type by the Risk Engine; the confidence by the Confidence
Engine. The Signal Engine reads those numbers, weighs them against each other, and
selects. If it recomputed even one, there would be two sources of truth for it, and
the moment there are two they drift — and a signal a trader acts on would disagree
with the evidence that justified it (AGENTS.md §2).

The one measure it computes itself is **confluence**, and even that is a reading of
already-computed evidence, not a fresh look at the market.

---

## 2. Confluence is not confidence

The single distinction this engine turns on. Conflating them double-counts the
platform's own evidence and calls the result conviction.

| | Question | Owner |
|---|---|---|
| **Confidence** | *Has a setup like this WON before?* — a probability, earned from outcomes | Confidence Engine (M09) |
| **Confluence** | *Does the evidence AGREE with itself, right now?* — a coherence measure | Signal Engine (here) |

A trade can have high confidence and low confluence (history says setups like this
win, but half the timeframes point the other way today), or high confluence and low
confidence (everything lines up, but there is no history to say it matters). They
are **orthogonal**. The engine uses confluence for ranking and confidence for the
win rate it shows, and neither is allowed to masquerade as the other.

The confluence engine reads the already-computed confidence contributors, the risk
factors, and the Regime Engine's multi-timeframe alignment, and reports how aligned
they are on a 0–100 scale. It touches no candle.

### The two kinds of confluence

1. **Internal** — do this candidate's own dimensions (regime, trend, pattern,
   momentum, volume, structure, volatility, risk) point the same way?
2. **Cross-strategy** — did INDEPENDENT strategies, plugins that never communicate
   (Founding Principle 4), arrive at the same trade separately? This is the more
   valuable kind, and it happens **above** the strategies, never between them
   (ADR-021 §1): ≥2 agreeing on the same symbol/direction/timeframe window are
   *fused into one signal* that credits them all — not two notifications for one
   trade.

**Agreement is worth ZERO uplift to confidence until the ledger prices it**
(ADR-024 §6). The old `+4 per agreeing strategy` was invented; confluence lifts the
ranking, never the probability, and the `uplift` field stays zero until there is a
measurement.

---

## 3. The pipeline, in a fixed and load-bearing order

```
candidates
   │  1. INTAKE      reject incomplete candidates as BUGS, loudly
   ▼
   │  2. FUSION      group agreeing strategies into one opportunity
   ▼
   │  3. RANK        order by the backstage signal-quality score
   ▼
 per opportunity, strongest first:
   │  FRESHNESS      is it still real?
   │  DEDUP          have we already published this?
   │  FLOORS         confidence AND confluence both above threshold?
   │  PUBLISH        if all pass, it becomes a signal
   │  PRIME          the strongest, proven, in-budget signals are Primed
   ▼
 published signals + explained suppressions
```

Everything that makes a decision is passed **in** — the recent feed, the budget
ledger, the clock. Nothing is fetched mid-pipeline. That is what makes the whole
thing **deterministic**: the same inputs always produce the same signals, in the
same order, with the same Prime awards. A replay of a day reproduces it exactly —
an acceptance criterion, and the only way the platform's own history can be trusted.

### Intake incompleteness is a bug, not a rejection

A trade suppressed for a thin spread is the machine working. A candidate arriving
with no confidence report is the machine **broken**. The two must never be filed
together — one is a quiet market, the other a silent defect, and a platform that
confuses them will one day go dark and call it a calm day. So intake **throws** on
an incomplete candidate rather than returning a tidy suppression.

---

## 4. Deterministic ids, and why they matter

A signal's id is **derived** from the opportunity — `sig:{symbol}:{timeframe}:
{direction}:{barTime}:{hash(sorted strategies)}` — never generated randomly. This
one choice buys three things at once:

- **Idempotency** — re-running a bar cannot publish the same opportunity twice; the
  database's primary key refuses it.
- **Deduplication** — an exact recurrence collapses for free.
- **Reproducible replay** — the same day always produces the same ids, so a replay
  agrees with the run it replays.

Strategies are sorted before hashing, so a confluence of {breakout, level-bounce}
has one id however the two arrived.

---

## 5. Freshness — a signal must never outlive its conditions

The quietest and most damaging failure a signal product can have: a setup fires,
the pipeline grinds through risk and confidence and confluence, and by the time it
would publish, price has already run to the target or broken the stop — and the
platform tells a trader to enter a trade that no longer exists. The entry is stale,
the R:R the signal promised is gone. Freshness is the publication-time backstop,
asking not "was the evidence fresh when evaluated?" but "is it STILL fresh, now, at
the moment of publishing?" A signal's `expiresAt` is set at birth, not left to a
sweep that might run late.

---

## 6. Deduplication — one trade, not three notifications

The same real opportunity announces itself many times: a strategy fires on
consecutive bars as its condition persists; two similar strategies both catch one
breakout; the pipeline re-runs after a reconnect. Confluence merges *different*
strategies agreeing; deduplication collapses the *same* opportunity recurring. "The
same" means same symbol, same direction, same timeframe, an entry within the zone
tolerance, and a bar within the window — all four, because a LONG and a SHORT at one
price are opposite trades, and the same setup a week apart is two genuine chances.

---

## 7. The Prime budget — scarcity on purpose

Prime is the day's few elite slots (ADR-021 §2): roughly 4–5, delivered whenever
conditions are met, **not** a feed. Only Prime interrupts a trader. The budget is a
ledger, not a counter — reconstructed from durable rows so it survives a restart,
and so "why was this not Prime?" always has an answer: the slots were spent, here is
on what, in rank order. Caps bind it further: per symbol (one coin cannot own the
day), per strategy (not one thesis repeated), per hour (a single volatile hour
cannot spend the whole day).

### Prime awards ZERO today — and that is correct

Prime requires `primeEligible`, which the Confidence Engine sets only when a
strategy is **PROVEN** — a settled *live* record, not a replayed one (ADR-023 §4).
No signal has ever been published and settled, so no strategy is proven, so nothing
is Prime.

This is the platform's honesty made structural. Prime is where the platform stakes
its reputation; a backtest does not earn that. The sequencing is deliberate:
publish non-Prime signals now → they settle in the ledger (M11) → strategies earn a
live record → Prime unlocks for future signals. A Prime budget that awarded slots to
unproven strategies on day one would be the whole fraud this codebase exists to
refuse, wearing a gold star. **The mechanism is fully built and tested** — the caps,
the floor, the ranked allocation — so the day a strategy becomes proven, Prime works
without a line changing. It simply, honestly, has nothing to award yet.

---

## 8. The lifecycle — a settled outcome is a matter of record

A published signal is a state machine, and terminal states are terminal:

```
ACTIVE ──▶ TRIGGERED ──▶ COMPLETED   (a win)
   │           │      ──▶ STOPPED     (a loss)
   │           └──────▶ EXPIRED       (went nowhere)
   └────────────────▶ EXPIRED / STOPPED
```

`COMPLETED`, `STOPPED` and `EXPIRED` are absorbing — nothing leaves them. An attempt
to move a completed trade back to active **throws**, because a settled outcome that
can change is not a record, and the ledger's integrity (M11) depends on it. Every
transition is appended to an audit trail; a signal's whole life is reconstructable,
in order, and none of it is ever overwritten. Nothing is ever deleted (06-STRATEGIES
§5).

---

## 9. Explainability — the contradicting list is the one that matters

Every published signal carries `whyPublished`, `supporting`, `contradicting`, and
`unassessed`. The Signal Engine adds nothing new to these; it **assembles** the
explanations the upstream engines already produced — the evaluator's conditions, the
risk engine's blind spots, the confidence engine's supporting and contradicting
factors — into one account a trader can argue with.

Any system can list why it was right. Publishing why it might be *wrong*, at the
moment of decision, is what separates intelligence from a sales pitch (Founding
Principle 3). A published signal with an empty `contradicting` list on a middling
score is a bug, not a clean trade — and every "nobody checked this" from risk and
confidence travels all the way to the trader.

---

## 10. Verified end to end

Booted with the full stack against real Postgres, entries anchored to the live BTC
price:

- **Confluence fusion** — two independent strategies (breakout + level-bounce)
  agreeing on the same BTC long were fused into **one** signal crediting both, with
  the higher-confidence one primary.
- **Publication** — confidence 89, confluence 86, signal score 91.3, published to
  the feed, **Prime false** (nothing is proven).
- **Idempotency + dedup** — re-running the identical batch published **0 new**
  signals.
- **Lifecycle** — advanced `ACTIVE → TRIGGERED → COMPLETED`, and **refused** the
  illegal `COMPLETED → ACTIVE`, with the audit trail intact.
- **Boot** — `signal.policy` asserted coherent at startup; an incoherent policy
  (Prime floor below the publication floor, a cap that can never bind, ranking
  weights that do not sum to 1) refuses to boot.

`25` signal-engine tests, `586` API tests, `107` contract tests — all green.

---

## 11. Out of scope

Telegram / WhatsApp / email delivery · push notifications · AI commentary ·
portfolio tracking. **This engine's responsibility ends when a signal has been
published to the platform's internal event stream.** What happens to that
event — who is notified, how the outcome is recorded — belongs to the milestones
after it.
