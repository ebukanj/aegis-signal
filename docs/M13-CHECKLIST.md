# Milestone 13 — Notification Engine & Delivery Orchestrator — Checklist

`[x]` done · `[~]` in progress · `[ ]` not started.

The Notification Engine **only delivers information** — it never creates, modifies,
or re-decides a signal. Right event → right user → right channel → right time →
exactly once → fully observable.

---

## Backend

- [x] **Contracts** — `Notification` (delivery record: event, type, priority,
      channel, recipient, payload, status, attempts, providerResponse, timestamps),
      delivery lifecycle status, `NotificationPreferences`, notification events. Tests.
- [x] **Prisma** — `Notification` table (delivery tracking, attempts, audit) + migrate.
- [x] **Channel framework** — `INotificationChannel` (validate/send/health). Pluggable
      registry: adding a provider = implementing the interface, nothing else.
- [x] **Channels** — IN_APP (LIVE, over a notifications socket). Telegram / WhatsApp /
      Email / Push as structured provider INTERFACES (no credentials yet — they
      validate + report health + no-op-log, ready for real secrets).
- [x] **Template renderer** — deterministic templates per event (Prime Signal, TP, SL,
      Risk Alert, Strategy Disabled, Exchange Offline, digest). Markdown + plain text.
- [x] **Preference resolver** — enabled/preferred channels, priority threshold, quiet
      hours (+ timezone), filters. Default profile until a user system exists.
- [x] **Deduplication** — by (event/signal, type, channel, window). Configurable.
- [x] **Retry** — exponential backoff, max attempts, dead-letter queue.
- [x] **Scheduler** — immediate / delayed / digest via BullMQ (the `notification` +
      `dead-letter` queues already exist).
- [x] **Delivery tracker + repository** — QUEUED → SENDING → DELIVERED / FAILED /
      RETRYING / CANCELLED / EXPIRED. Every delivery has a lifecycle + audit.
- [x] **Orchestrator** — the pipeline: route → resolve prefs → select channels →
      render → dedupe → schedule → deliver → track.
- [x] **Event router** — listens to platform events (Prime published, settled, risk
      flag, strategy disabled, exchange offline) → orchestrator. No business logic.
- [x] **Notifications gateway** — WebSocket, real IN_APP delivery + live page updates.
- [x] **Read API + admin metrics** — history, delivery stats, channel/provider health.

## Frontend (app stays live)

- [x] **Wire the Notifications page** to the real API; retire `mock-notifications`.
      History + delivery stats + channel health are live; external-channel connection
      state is honest (interface-ready, not connected — no credentials).

## Close-out

- [x] Tests (channels, templates, retry, dedup, scheduling, preferences, delivery
      lifecycle, quiet hours). docs/17. AGENTS. Full suite. Verify live. Commit. STOP.

---

### Notes

- **Never business logic.** The orchestrator delivers; it never re-evaluates a
  signal, a score, or a risk decision.
- **Exactly once** — deduplication + a deterministic delivery id per (notification,
  channel) make a re-run idempotent.
- **Lose a provider without losing notifications** — retry + DLQ + independent
  channels; one provider down never blocks the others.
- **No real users/providers yet.** IN_APP is live; external channels are
  interface-ready and honest about not being connected. Per-user preferences arrive
  with the Users milestone; a default profile stands in.
