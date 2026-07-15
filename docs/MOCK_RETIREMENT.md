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
| ~~`features/signals/data/mock-signal-details.ts`~~ | ~~Signal detail~~ | **RETIRED (M10).** `GET /api/v1/signals/:id` is live. |
| ~~`features/signals/data/mock-today.ts`~~ | ~~Today's feed~~ | **RETIRED (M10).** `GET /api/v1/signals/today` is live, and the feed subscribes to the `signals` socket for live updates. |
| ~~`features/signals/data/mock-confidence.ts`~~ | ~~Confidence breakdown~~ | **RETIRED (M10).** Real `CalibratedConfidence` rides on the signal detail. |
| ~~`features/signals/hooks/use-live-price.ts`~~ | ~~Live price~~ | **RETIRED in M03.** The seeded random walk is deleted. Price now streams from Binance over the `market` Socket.IO namespace (`price` event) via `lib/market-socket.ts`. **Entry status still computed in the hook — it belongs to the Risk Engine and moves there in M05.** | ✅ M03 |
| ~~`features/insights/data/mock-insights.ts`~~ | ~~News, risk flags~~ | **RETIRED (M12).** `GET /api/v1/insights` serves real classified news + corroborated risk flags. Social/fundamentals architecture-only (empty). |
| ~~`features/track-record/data/mock-record.ts`~~ | ~~Track Record + reliability curve~~ | **RETIRED (M11).** `GET /api/v1/track-record` serves the Outcome Ledger's real settled trades + the calibration curve. |
| ~~`features/notifications/data/mock-notifications.ts`~~ | ~~Notification centre~~ | **RETIRED (M13).** `GET /api/v1/notifications` serves the real delivery record; a live toast fires over the `notifications` socket. |
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

---

## What M03 taught us, and the next mock deletion must not forget

**A real feed does not politely replace a mock — it exposes what the mock was
hiding.**

Wiring the real price in broke the UI, and the break was instructive. Mock BTC
signals carried an entry of **$97,800**. Real BTC was **$62,700**. Every card
immediately read *"Invalidated: price already reached the stop"* — because it had.
The mock had been quietly free to invent a market that agreed with it.

Two rules came out of that, and they apply to every remaining mock:

1. **A mock may lie about values. It must never lie about reality.** The mock
   listed TON perpetuals on Binance. Binance lists no TON perpetual, and the
   Symbol Registry refused to invent one. A market that does not exist is not a
   placeholder — it is a bug waiting to reach a trader.
2. **When half the data is real, the other half has to be anchored to it.** Mock
   entry prices are now pinned near real market prices, so the live-price verdict
   means something. The signals are still fabricated; they are simply no longer
   fabricated *in a way that contradicts the market*.

---

## Environment: two things that look like bugs and are not

Recorded here because both cost real debugging time, and both look exactly like a
broken exchange adapter.

**The ISP blocks crypto exchanges at the DNS layer.** `api.binance.com` does not
resolve; `google.com` does. Every adapter reports `ENOTFOUND` and the platform
looks totally offline. `EXCHANGE_DNS_SERVERS` (in `apps/api/.env`) routes
*exchange hostnames only* through a resolver that answers honestly. It is a
development escape hatch — the schema **refuses to boot** if it is set in
production.

**The Binance futures WebSocket is mute on this network.** It connects. It
acknowledges the subscription (`{"result":null}`). It then delivers **nothing,
ever** — a socket that looks perfectly alive and is dead, which the adapter's own
comments name as the worst failure this module can have. The watchdog counts *data
frames*, not messages (an ACK is a message), and after two mute connections the
platform degrades to REST polling every 3s. Prices stay **real** and from the
**same perpetual market** — just slower. `/api/v1/market/health` reports
`priceSource: "REST_POLL"` when this is happening, so it is never a silent
downgrade.

**Do not take the labels off before the calibration exists.** Doing so would
rebuild the exact lie this codebase was cleaned of: a random number wearing a
percent sign ([ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)).
