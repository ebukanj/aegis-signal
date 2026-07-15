# The Notification Engine — The Last Mile

> The decision has already been made. This engine only answers:
> **who should hear about it, on which channel, and when?**

It never creates a signal, never modifies one, never recalculates a score, never
overrides a risk decision. It is the communication backbone — everything important
eventually passes through it on its way to a trader — and its whole discipline is
that it carries the message without rewriting it.

---

## 1. Four promises

The right event, to the right user, through the right channel, at the right time —
**exactly once**, with full observability.

- **Exactly once.** Every delivery has a DETERMINISTIC id, hashed from
  (recipient, type, event-key, channel). A re-processed event — a retried job, a
  restarted worker replaying the queue — maps to a row that already exists, and the
  database refuses the duplicate. A separate time-window dedup collapses "two BTC
  Prime signals in ten minutes" into one.
- **Honour the recipient.** The preference resolver can only ever REMOVE a
  delivery — a channel not enabled, a priority below threshold, a coin off the
  watchlist, the hours a trader asked not to be disturbed. A suppressed
  notification is recorded (so it is auditable) but not sent. Users never receive
  what they did not ask for.
- **Lose a provider, not a notification.** Channels are independent. One being
  down, or unconfigured, is skipped or retried — never fatal to the others. The
  in-app channel needs no external provider, so the platform can always deliver
  *something*.
- **Full observability.** Every delivery carries its whole lifecycle — QUEUED →
  SENDING → DELIVERED / RETRYING / FAILED / SUPPRESSED / CANCELLED — as a matter of
  record. A notification the platform cannot prove it delivered is one a trader
  cannot rely on.

---

## 2. The pipeline

```
platform event → route → resolve preferences → deduplicate
              → deliver (with backed-off retries) → track
```

The **event router** listens to platform events (a Prime signal published, a trade
settled, a coin flagged, a strategy auto-disabled, an exchange going offline),
decides the notification type and audience, renders the message, and hands it off.
It contains **no business logic** — a `SIGNAL_PUBLISHED` is worth a notification
because it was published; whether it *should* have been was decided long before.
Adding a notifiable event is a new handler and a template, and nothing existing
changes.

---

## 3. Channels — provider-agnostic by construction

Every provider hides behind one interface (`validate` / `health` / `send`). The
orchestrator never imports a provider SDK, never learns what a bot token looks
like. Adding SMS or Discord is a class and a registry line.

- **IN_APP is LIVE.** It needs no external provider — it emits an event the
  notifications WebSocket broadcasts to the browser, so a Prime signal published
  becomes a toast in the trader's browser the instant it happens. This is the
  channel the whole engine is demonstrated against end to end.
- **Telegram / WhatsApp / Email / Push are provider INTERFACES, wired but not
  connected.** Each is a complete channel behind the interface — the send path is
  written out — but has no secret yet, because there is no user to deliver to and no
  account to send from. So they report `NOT_CONFIGURED` and DECLINE (a decline, not
  a failure: an unconfigured channel is skipped cleanly, never retried, never
  polluting the failure stats). The day a token lands in config, the same class
  connects and delivers, and nothing else in the engine changes.

---

## 4. Templates — deterministic, execution-complete, never AI

Templates are pure functions of their input: the same signal always renders the
same message, in markdown (for Telegram) and plain text (for SMS), with **no model
in the loop** (AI-generated content is out of scope). Every signal message carries
the facts a trader needs to act in seconds — direction, entry, stop, targets,
confidence, strategy — plus a deep link. That determinism is what makes the dedup
id stable and the tests assertable, and it is the same principle as everywhere
else: a message a trader acts on is not something a language model improvises.

---

## 5. Preferences — the "who / when", and only ever a filter

Enabled channels, a priority threshold, quiet hours (with a timezone, and an
overnight window that correctly wraps midnight), a watchlist, a strategy filter, a
confidence floor. Quiet hours is the one gate a CRITICAL notification may pierce (a
stop-loss may wake a trader at 3am; a digest waits for morning). Until a user
system exists, one conservative default profile stands in — in-app only, quiet
hours off — and the shape is per-user-ready so that when Users lands, this loads
from settings and nothing else changes.

---

## 6. Retry — trying vs giving up

The retry policy is pure arithmetic on the attempt count: attempt 1 waits ~1s,
attempt 2 ~4s, attempt 3 is the last, and the fourth outcome is the dead letter.
Only RETRYABLE failures retry — a permanent failure (a bad address, a 400, an
unconfigured channel) is never retried, because hammering a provider that has told
you no earns a rate-limit and delays everything else. The distinction between
transient and permanent is the channel's to make; it is the only layer that
understands its provider's errors.

---

## 7. The app stays live (owner directive)

The Notifications page now renders the platform's REAL delivery record from
`GET /api/v1/notifications` — what was sent, to which channel, and how it went.
Deleted `mock-notifications`. And a **live toast** fires anywhere in the app the
instant the in-app channel delivers, over the `notifications` socket. What is
honestly derived rather than stored: the routing "rules" shown are the engine's
default type→priority→channel mapping (per-user config arrives with Users), and the
volume chart is aggregated from the real recent deliveries — sparse on a quiet
week, which is the truth.

---

## 8. Verified end to end

A real published BTC signal was routed through the pipeline: the router rendered a
Prime template, the orchestrator resolved the default preferences, deduplicated,
delivered on the in-app channel, marked it DELIVERED, and broadcast it to the
browser. The delivery is in the record with its full lifecycle; a re-dispatch of
the same signal delivered nothing twice.

`15` notification tests · `635` API tests · `117` contract tests · web typecheck
clean.

---

## 9. Out of scope

Signal generation · risk evaluation · confidence scoring · AI-generated content ·
portfolio recommendations. The engine only communicates platform events. It should
never make a trading decision, and it never does — it is the last mile, and the
last mile carries the message.
