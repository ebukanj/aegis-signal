# The Strategy Evaluator — the Document Interpreter

> Search the module for the word "Breakout". For "Reversal". For any strategy's name.
> **They are not there, and they cannot be.**

Every strategy this platform will ever run — the six built-ins, and every strategy a
user invents tomorrow — is a `StrategyDefinition` **document**. There is exactly one
thing that reads it. Not six plugins. Not a `switch`. One evaluator.

**A new strategy is a new document, not a new code path.** That is
[ADR-023](adr/ADR-023-strategy-as-document.md), and it is the load-bearing decision of
the whole platform: it is why a user can invent a strategy and have it run on precisely
the machinery the built-ins run on, with precisely the same rigour.

---

## 1. This is enforced by a test, not by a promise

A code review can promise there is no strategy-specific code. `evaluator.spec.ts`
**proves** it, on every commit, by reading the module's own source:

- No file names any strategy's `id` — anywhere.
- No file names any strategy's `name` — in code. (Comments may, to explain something.)
- No file contains `switch (strategy.id)` or `strategy.id === …`.

The moment one appears, user strategies become second-class citizens on a path nobody
maintains, and ADR-023 stops being a decision and becomes a slogan.

---

## 2. The entry language — and why the nesting stops at one level

The brief asked for unlimited depth: `A AND (B OR C) AND NOT D AND (E OR (F AND G))`.
A recursive tree is not hard, and the evaluator could support it in an afternoon.

**It doesn't, and the reason is ADR-023.**

If the evaluator understands logic the **strategy editor cannot render**, then built-in
strategies get powers user strategies do not. Worse: a user opening a nested built-in in
a flat editor would have its rules **silently flattened**, and would then be trading
rules nobody wrote.

That is not hypothetical. This codebase already shipped an editor that rendered `0`
where an indicator operand belonged — so touching a strategy would quietly turn *"price
above the highest high"* into *"price above 0"*.

> **The document language is exactly what the editor can express.** Not a subset, not a
> superset. That constraint is a feature.

So the language is:

```
entry:  ALL of these must be true
          ├── a RULE          (one condition, optionally NOT)
          └── an ANY-OF group (two or more rules; any one will do)
```

One level of OR. `NOT` is a checkbox on a rule, not a node in a tree — it says the same
thing, it cannot be nested wrongly, and a trader sees it at a glance.

### It earned its keep immediately

**Pattern Break** promised *"flags, wedges and triangles"* in its summary and demanded a
falling wedge **and nothing else** in its rules — because the language had no way to say
"any of these". The document and its own description had been quietly contradicting each
other. It now says what it always meant.

**Level Bounce** gained `NOT (change of character)`. A level bounce buys a floor; a
change of character says the floor is giving way. Buying a level while structure is
breaking is not a bounce, it is catching a knife — and the language had no way to forbid
it.

---

## 3. The pipeline

```
document → VALIDATE → resolve dependencies → assemble context (FROZEN)
         → regime gate → rules → direction → trade plan → candidate + explanation
```

### Dependencies are resolved in ONE pass, before anything is computed

The lazy alternative — resolve each operand as the evaluator reaches it — looks simpler
and is worse in three ways:

1. **It serialises the engines.** Indicators would be fetched one at a time, in whatever
   order the rules happen to be written in.
2. **It makes cost depend on rule order.** A strategy failing on its first rule computes
   nothing; the same strategy with its rules swapped computes everything. Two identical
   documents, different performance, no explanation.
3. **It lets two rules judge different moments.** A rule resolved late could see an
   indicator computed from a market that has *moved* since the rule before it. The
   document would be evaluated against two different instants — irreproducible, which
   quietly destroys calibration (ADR-024).

So: collect everything, resolve everything in parallel, **freeze it**, then interpret.

**The evaluator never computes anything.** Indicators, patterns and regime belong to
their engines (AGENTS.md §2). It assembles a shopping list and asks.

---

## 4. The regime gate runs FIRST

Before a single rule is read.

A strategy standing in the wrong market has not "failed its conditions" — **it was never
allowed to ask**. Reporting a regime block as a failed entry rule would send a trader
hunting through indicator thresholds for a problem that is about the environment, and
they would never find it. So those rules report `SKIPPED`, not `FAILED`.

The gate has **no opinions of its own**. It reads what the strategy *declared*
(`regimes` / `avoidRegimes`, M06). A lookup table of "which strategies suit a bull trend"
living inside the engine would make every user-authored strategy invisible to it.

### The higher-timeframe veto

Every rule can pass on the 1h while the daily screams the other way. That trade is a
**bounce** — the most expensive trade in retail. The lower timeframe looks perfect right
up until the higher one reasserts itself and takes it all back plus the stop.

A `conflict` above 0.5 is a **rejection**, not a warning. A strategy is entitled to be
right about its own timeframe and still not be allowed to trade.

---

## 5. Direction is DERIVED from evidence, never guessed

A `LONG` or `SHORT` strategy has already answered. A `BOTH` strategy has not.

1. **A pattern that passed and has a direction.** A bull flag is long.
2. **Otherwise, the regime.** In a bull trend, a `BOTH` strategy is long.

If neither speaks, **the engine refuses.** A direction picked by coin flip on a setup
that passed every other rule would be indistinguishable from a high-quality signal and
would be pointing at random — the worst possible thing this platform could emit.

---

## 6. A candidate is the weakest opinion the platform holds

```
CandidateSignal
  strategyId · strategyVersion · rulesHash
  symbol · direction · entryPrice
  proposedStop · proposedTargets      ← PROPOSALS
  regime · explanation
```

It carries **no confidence**. It has **no approval**. It has **not been risk-validated**.

**`proposedStop`, not `stopLoss`.** The Risk Engine owns the stop, the size, the leverage
and the market type. It can move this stop and it can refuse the trade because of where
it lands. The naming is not pedantry — a field called `stopLoss` here would eventually be
acted on by something that forgot to ask the engine that owns it.

The Risk Engine can kill every candidate this module produces, and that is **not a
failure of this module**. The veto *is* the product (AGENTS.md §1).

### The id is deterministic

`strategyId:version:symbol:timeframe:direction:barTime`

Same document, same bar → same id. A worker that retries after a crash, or two workers
racing on the same closed candle, **cannot double-publish a trade**. A random UUID here
would let a restart emit the same signal twice.

---

## 7. A rejection is a first-class result

Returning `null` when a strategy does not fire would throw away the most operationally
useful thing this engine knows: *which condition said no*.

> **Silence is a feature. Silence with no explanation is a bug.**

Every rule reports one of four outcomes, and the distinctions are load-bearing:

| Outcome | Meaning |
|---|---|
| `PASSED` | with the actual reading: *"RSI(14) = 27.4, the rule wanted below 30"* |
| `FAILED` | the market said no |
| `SKIPPED` | never evaluated — the regime gate had already blocked the strategy |
| `UNAVAILABLE` | **we were blind.** The data was not there. |

`FAILED` vs `UNAVAILABLE` is the difference between *"the market said no"* and *"we could
not see"*. A strategy reporting FAILED when its indicator was never computed would show a
mysteriously low pass rate with nothing to explain it, and an operator would go hunting
for a market problem that does not exist.

### `NOT (unavailable)` is not TRUE

The case that would quietly disarm a safety rule. A strategy saying *"do NOT enter if
there is a change of character"* that cannot detect patterns at all must not sail through
its own safety check **on the strength of being blind**. That is the exact opposite of
what the rule was written to do.

---

## 8. Versioning — a record belongs to the RULES, not to the name

Confidence must be **earned** (ADR-024). A strategy's track record is evidence about a
specific set of rules. The moment those rules change, it is evidence about nothing: a 61%
win rate produced by an RSI threshold of 30 says **nothing whatsoever** about the same
strategy at 25.

Carrying the record across an edit would let a trader tune a strategy until it looked good
and inherit the confidence of the version that actually earned it. **That is fabricated
confidence with extra steps** — precisely what this platform killed once already.

So:

- `rulesHash(strategy)` fingerprints only the **evaluable** parts — entry, filters, stop,
  targets, timeframe, direction, regimes, **and risk** (a win rate earned at 1% risk is
  not evidence about the same rules at 4%).
- Change a rule → **version bumps, record is wiped.** The strategy is UNPROVEN again.
- Rename it, fix a typo, toggle it off and on → **nothing happens.** A trader must be able
  to fix a typo without being punished.

The hash is **stable across JSON round-trips and key reordering** — otherwise a strategy
would "change" every time it passed through a database or a form, and silently lose its
record for doing nothing at all.

Every candidate carries the `rulesHash` that produced it. The strategy may be edited
tomorrow; when the trade settles next week, the ledger must know which rules actually
fired it.

---

## 9. One copy of the six documents

They live in `packages/contracts` and **both apps import them**.

Two copies would be two sources of truth for one concept (AGENTS.md §2), and they *would*
drift — somebody adds a condition in one place, and the platform quietly evaluates a
strategy that is not the one the user is reading.

A strategy document is part of the API surface: it is the *language* the two halves of the
platform use to talk about a trading idea.

**Crowd Squeeze stands down automatically** — it needs funding rate and open interest, and
the platform has neither. Evaluating it would fail every time on an `UNAVAILABLE` condition
and bury the real rejections in noise. The health metrics say so explicitly rather than
through a mysteriously zero pass rate.

---

## 10. Verified on live BTC

All six documents, through every engine, against the real market:

```
REGIME    15m TRENDING_BULL EXPANDED   1h TRENDING_BULL EXPANDED
          4h  TRENDING_BULL NORMAL     1d RANGE

Breakout        rejected — Bollinger is not inside Keltner (64,599 vs 64,071): no squeeze
Trend Pullback  rejected — the 1d EMA(21) 62,931 is below EMA(200) 75,530: no uptrend to pull back into
Reversal        BLOCKED  — declares TRENDING_BULL as a market to AVOID
Level Bounce    BLOCKED  — declares TRENDING_BULL as a market to AVOID
Pattern Break   rejected — no falling wedge, no bull flag, no ascending triangle on the 4h
Crowd Squeeze   STOOD DOWN — needs the derivatives feed we do not have

0 candidates.
```

Every rejection carries the actual numbers. The two mean-reversion strategies were
**blocked by the regime gate before a single rule was read** — which is exactly what
`avoidRegimes` is for. Pattern Break's ANY-OF group reported all three options it tried.

**Zero candidates is the correct answer**, and it is the product working:

> *Say nothing at all when no such trade exists.*

A pass rate near zero is the expected shape of a healthy platform. A rising one is a
warning, not a win.

---

## 11. Out of scope

Risk validation · confidence · Prime budget · publication · notifications · AI commentary.

**This engine answers one question: are this document's conditions satisfied?**
