# Mock Retirement Register

**Governed by:** [AGENTS.md](../AGENTS.md)
**Rule:** [ADR-022 §1](adr/ADR-022-contract-first-backend.md) — *delete each mock as its endpoint lands. Never adapt one.*

---

## Why this file exists

Every mock in `apps/web` is a **lie with a deadline**. It exists so the product
surface could be designed before the backend, and [ADR-022](adr/ADR-022-contract-first-backend.md) records that as a
deliberate choice rather than an accident.

But a mock that survives its endpoint becomes a **second source of truth** — and
the moment two sources exist, they drift. The drift will not announce itself; it
will show up as a number on a trader's screen that no backend ever produced.

So each mock is listed here with the endpoint that executes it. When that
endpoint ships, the mock is **deleted, not adapted**. Adapting it — keeping it
"for tests", "for storybook", "just in case" — is how it survives.

**This register is done when it is empty.**

---

## The rule for deletion

1. The endpoint exists in `apps/api` and returns real data.
2. The response is validated by `contract(schema, payload)` — the contract is
   enforced on the way out, not merely intended.
3. The frontend's `*-api.ts` calls it instead of the mock.
4. **The mock file is deleted in the same commit.** Not the one after.

---

## Register

| Mock | Feeds | Killed by | Milestone |
|---|---|---|---|
| `features/scanner/data/mock-opportunities.ts` | Signals list, Scanner results | `GET /api/v1/signals` · `POST /api/v1/scan` | M06 — Signal Engine |
| `features/scanner/data/mock-scan.ts` | Scanner run + rejections | `POST /api/v1/scan` | M05 — Risk Engine *(rejections come from it)* |
| `features/signals/data/mock-signal-details.ts` | Signal detail panel + report | `GET /api/v1/signals/:id` | M06 — Signal Engine |
| `features/signals/data/mock-today.ts` | Today's Prime feed | `GET /api/v1/signals/today` | M06 — Signal Engine |
| `features/signals/data/mock-confidence.ts` | Confidence breakdown | `GET /api/v1/signals/:id` *(embedded)* | M07 — Confidence Engine |
| `features/signals/hooks/use-live-price.ts` | Live price + entry status | WS `market.price` | M03 — Market Data |
| `features/insights/data/mock-insights.ts` | News, social, fundamentals, Risk Flags | `GET /api/v1/insights` | M09 — Insights |
| `features/track-record/data/mock-record.ts` | Track Record + reliability curve | `GET /api/v1/track-record` | M08 — Calibration |
| `features/notifications/data/mock-notifications.ts` | Notification centre | `GET /api/v1/notifications` | M10 — Notifications |
| `features/settings/data/mock-settings.ts` | Settings | `GET /api/v1/settings` | M11 — Users |
| `features/admin/data/mock-admin.ts` | Admin console | `GET /api/v1/admin/*` | M11 — Users |
| `constants/strategies.ts` *(the six seeds)* | Strategies page | **Not a mock.** These are *seeds* — the backend loads the same documents into the `Strategy` table (ADR-023). They move server-side; they are not deleted. | M04 |

---

## What is NOT a mock, and must not be deleted

**`packages/contracts`.** It is the API, not a stand-in for it (ADR-022).

**The six strategy documents in `constants/strategies.ts`.** A strategy is a
document, not code ([ADR-023](adr/ADR-023-strategy-as-document.md)) — these are the seed rows the backend will load
into the database. They relocate; they do not die.

**`lib/seeded-random.ts`.** It exists so mock data is *deterministic* — the same
values every load. It leaves with the last mock that uses it.

---

## The one that matters most

`mock-confidence.ts` produces a score in the honest *shape* and stamps every one
**UNCALIBRATED**. When the Confidence Engine and the Calibration job land
(M07–M08), that mock dies **and the labels come off**.

**Do not take the labels off before the calibration exists.** Doing so would
rebuild the exact lie this codebase was cleaned of: a random number wearing a
percent sign ([ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)).
