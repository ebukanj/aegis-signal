# ADR-023 — Decongestion: Strategy as Document, and the Removal of Backtesting, Paper Trading and the Dashboard

**Status:** Accepted
**Date:** 2026-07-13
**Amends:** [04-PROJECT_PRD](../04-PROJECT_PRD.md) §12 (scope), §15–16 (modules/workspaces), [05-SOLUTION_ARCHITECTURE](../05-SOLUTION_ARCHITECTURE.md) §4
**Supersedes:** the 11-module strategy spec in [06-STRATEGIES](../06-STRATEGIES.md) (v1.0–v1.2)
**Preserves:** [ADR-021](ADR-021-confluence-prime-signals-execution-guidance.md) in full — confluence, the Prime budget, and execution guidance are untouched.

---

## Context

The frontend shipped ten workspaces and eleven strategies. Both numbers came
from the PRD, not from the product. Reviewing the running app against the one
sentence that defines it —

> *Tell the trader: here is a trade worth taking right now, here is exactly how
> to take it, here is why, and here is what proves it wrong — and say nothing at
> all when no such trade exists.* ([AGENTS.md](../../AGENTS.md) §1)

— most of what was on screen could not justify itself. The owner's verdict was
blunt and correct: it is too noisy, the strategy names mean nothing to a trader,
and the strategy page is unreadable.

Two further requirements arrived with that verdict, and they look contradictory:

- **Users must be able to edit, disable, and create their own strategies**, and
  the system must run them.
- **The backend must not become difficult to build or maintain.**

Eleven hand-coded strategy plugins satisfy neither. You cannot let a user author
a twelfth plugin without executing user-supplied code, and eleven bespoke
modules is a great deal of backend to write and keep alive.

## Decision

### 1. A strategy is a document, not code

Every strategy — built-in and user-created — is an instance of
`StrategyDefinition` (`packages/contracts/src/strategy.ts`): a closed vocabulary
of indicators, operators, entry conditions, filters, a stop rule, R-based
targets, and risk caps.

The backend therefore implements **one evaluator**, not eleven plugins. The five
built-in strategies are seeded documents; a user's strategy is another row of the
same shape. This resolves the contradiction above completely: user authorship
becomes *data entry*, not code execution, and the strategy engine gets smaller
rather than larger.

`describeStrategy()` lives in the contract and renders any document as plain
English — so the Strategies page, the signal's "why", and the Telegram alert all
speak with one vocabulary and cannot drift apart.

**Accepted limit:** the vocabulary cannot express news sentiment or liquidation
cascades. Those become platform services (§4), not strategies. We will not
stretch the schema to swallow them.

### 2. Eleven strategies become five, in plain English

| New | Replaces |
|---|---|
| **Breakout** | Ignition |
| **Trend Pullback** | Tidewater |
| **Reversal** | Rubber Band + Flush |
| **Level Bounce** | Sniper + Killzone |
| **Crowd Squeeze** | Crowded Boat *(ships disabled — needs a derivatives feed)* |

"Rubber Band" and "Killzone" are internal codenames. They tell a trader nothing
about what the rule looks for. A strategy's name is documentation.

**Deleted: Relay** (relative-strength rotation) and **Harvest** (delta-neutral
funding carry). Neither says *"here is a trade worth taking right now."* Relay is
allocation advice; Harvest is yield farming. They fail §1.

### 3. Backtesting, Paper Trading and the Dashboard are removed

- **Backtesting** and **Paper Trading**: traders already do both, better, in
  TradingView or on a live exchange. Two entire laboratories were serving work
  done elsewhere.
- **Dashboard**: a page that summarised other pages. Signals is now the home
  page and carries market context itself.

Navigation drops from ten items to five.

### 4. Trust moves from the backtest to the live ledger

Removing backtesting while *adding* user-authored strategies opens a real hole: a
user could invent a rule on Tuesday and be shown a signal from it on Wednesday
with "Confidence: 87%" attached — a number backed by nothing.

The fix is not a laboratory. It is **one ledger**: every signal's outcome is
recorded, and each strategy carries a live record (`signals · wins · avgR ·
expectancy`) or the honest label **UNPROVEN**.

- An **unproven strategy may emit signals, but never a Prime one.** The daily
  4–5 Prime budget is reserved for rules that have earned it.
- Negative rolling expectancy **auto-disables** a strategy.

This is roughly one table and three numbers on a card — and it is the entire
difference between *"Aegis says 87%"* and *"Aegis has been right 12 of 23 times
with this rule."* [06-STRATEGIES](../06-STRATEGIES.md) said it first: a bot printing decorative
percentages is precisely what this platform is not.

The **Analytics** workspace survives, gutted, repurposed as that scoreboard
("Track Record"). Not heatmaps and radar charts — four numbers and a calibration
check.

### 5. Chameleon and Oracle survive as services, not strategies

- **Chameleon** → the **regime filter**: invisible plumbing that suppresses
  Breakout in a range and Reversal in a trend. Not a toggle, not a page.
- **Oracle** → the **Insights** tab (news, coin updates, AI summaries) *and* a
  **Risk Flag** that blocks every signal on a coin just hacked or depegged. That
  second half is pure "Protect the Trader" — it is a veto, and vetoes belong to
  the Risk Engine, never to a strategy.

## Alternatives considered

- **Keep eleven plugins; no user-created strategies.** Rejected: fails an
  explicit product requirement, and leaves the largest backend.
- **Let users write strategy code (JS/Python) in a sandbox.** Rejected: arbitrary
  code execution, non-deterministic, unbounded attack surface. Violates
  Philosophy 14 (Deterministic Core).
- **AI generates strategies from natural language.** Rejected as the *authoring*
  mechanism: it puts AI in charge of live trading logic, violating Founding
  Principle 9 (AI assists, never decides). AI may later *draft* a document that
  the user reviews and confirms in the builder — but it never ships one silently.
- **Keep backtesting.** Rejected by the owner: it duplicates TradingView. The
  ledger (§4) preserves the validation principle at a fraction of the cost.

## Consequences

**Positive**
- The strategy engine shrinks from eleven modules to one evaluator.
- Strategies become configuration, and adding one costs a row, not a deploy.
- The Strategies page becomes readable, because the document *is* the
  explanation.
- Ten workspaces become five; ~52 files of frontend deleted.

**Negative / accepted**
- The DSL cannot express every edge that hand-written code could. Accepted:
  those become platform services, and the boundary is stated in [06-STRATEGIES](../06-STRATEGIES.md) §1.
- Users can build bad strategies. Mitigated, not prevented, by §4: they are
  labelled UNPROVEN, barred from Prime, and auto-disabled on negative
  expectancy.
- Founding Principle 14 (Continuous Validation: backtest → paper → live) is
  amended. Validation now happens on the live ledger rather than in a backtest
  laboratory. The principle — *no strategy earns trust without evidence* —
  stands; only its mechanism changed.

**Follow-up**
- Rewrite the Signals workspace as the home page: today's Prime signals, detail
  in a side panel, and an empty state that presents silence as the system
  working.
- Rebuild the Scanner as evidence — what was scanned, what was rejected, and
  *why*.
- Rebuild the Strategies page against `StrategyDefinition`, with the builder.
- Update [04-PROJECT_PRD](../04-PROJECT_PRD.md) §12/§15/§16 to match this scope.
