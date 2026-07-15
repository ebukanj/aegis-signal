# Milestone 11 — Outcome Ledger & Track Record — Build Checklist

Live progress tracker for M11. Each item is checked when **done and verified**.
Kept in sync with the in-session todo list. Notes/instructions inline where they help.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not started

---

## Backend — the ledger

- [x] **Contracts** — `packages/contracts/src/ledger.ts`: `LedgerEntry` (immutable
      snapshot), `OutcomeType`, `Settlement` (R / PnL% / MFE / MAE / duration /
      exitReason), `TrackRecord`, `StrategyStatistics`, `PerformanceCurves`,
      `AuditEvent`. Tests green (112 contract tests).
- [x] **Prisma** — `LedgerEntry` + `LedgerAudit` (append-only, immutable settlement),
      migrated (`20260715125425_outcome_ledger`).
- [x] **Ledger repository** — append-only register / settle / query; audit row on
      every mutation; **settlement is one-way and once** (re-settle refused, appended
      as a CORRECTION note, never overwritten).
- [x] **Outcome calculator** — walk the price path → outcome, R, PnL%, MFE, MAE,
      duration, exit reason. One-bar-touched-both = STOP (matches the M09 labeller,
      pessimistic by design).
- [x] **Statistics engine** — per-strategy + whole-platform aggregation; streaks;
      performance curves (equity / win-rate / expectancy / drawdown). `basis`
      (NO_DATA / PROVISIONAL / ESTABLISHED) so a small sample can't pose as a record.
- [x] **Ledger service** (front door) — register from a `PublishedSignal`, settle,
      build the track record, emit `ledger.settled` + `calibration-data-available`.
- [x] **Lifecycle tracker** — listens to `SIGNAL_PUBLISHED`, registers the entry.
- [x] **Settlement worker** — every 30s, walks OPEN signals, settles the definitive
      ones from real candles, advances the signal lifecycle, emits `signals.changed`.
      **This is what makes the feed live** — a settled signal leaves the feed on its own.
- [x] **Replay engine** — deterministic re-read of the ledger for any slice.
- [x] **Ledger backfill** — settles the historical corpus signals from their known
      M09 outcomes so the track record is real on boot.
- [x] **Ledger module + controller** — `GET /track-record`, `GET /ledger/:id`. Wire
      `ScheduleModule` for the worker's `@Interval`.
- [x] **Tests** — settlement, lifecycle, determinism, partial profit, expiry,
      drawdown, deterministic replay, immutability (re-settle refused).
- [x] **docs/15-LEDGER.md**

## Dynamic / live feed (owner's requirement)

- [x] **Signals gateway** — emit `signals:changed` over Socket.IO on settlement /
      publication so the browser updates without a refresh.
- [x] **Frontend live subscription** — the feed refetches on `signals:changed`,
      re-ranks, and drops settled signals live (no manual reload).

## Track Record page (retire its mock — "no more mock data")

- [x] **Track Record read API** already at `GET /track-record`.
- [x] **Wire the frontend Track Record page** to the real ledger; delete its mock.

## Close-out

- [x] Verify end-to-end in the browser (live updates + real track record).
- [x] Full test suite green (contracts + API + web typecheck).
- [x] Commit M11 (99d4008), then **STOP for approval** before M12 (Insights Engine).

---

### Notes / instructions

- **Settlement is immutable.** Never add an "edit settlement" path. Corrections are
  new audit rows (`CORRECTION`), never overwrites (06-STRATEGIES §5).
- **Determinism.** The same price path must always settle the same way — no clock
  reads inside the calculator; `now` is injected.
- **Prime still awards 0** until a strategy has a settled LIVE record; the ledger is
  what will eventually flip that (ADR-023 §4).
- **Continuous liveness limit:** true always-fresh signals need a scan worker firing
  on each closed bar (not yet built). Until then the feed's *content* is the
  backfilled corpus; the *liveness* (settle/remove/re-rank) is real via the worker.
