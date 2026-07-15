# Milestone 12 — Insights Engine — Build Checklist

Live progress tracker for M12. `[x]` done · `[~]` in progress · `[ ]` not started.

The Insights Engine provides **context, never decisions**. It never creates,
rejects, or modifies a signal. It answers: *what happened outside price action that
the trader should know?*

---

## Backend

- [x] **Contracts** — canonical `Insight` (provider, source, category, severity,
      impact, entities, tags, confidence, url, language), `Entity`, `CollectorHealth`,
      timeline/search shapes; extend `insight.ts`. Tests.
- [x] **Prisma** — `Insight` table (normalized, dedup key, entities, tags) + migrate.
- [x] **Collector framework** — `IInsightCollector` (collect/normalize/validate/
      health/retry); dependency-free RSS parser.
- [x] **Real RSS collectors** — Cointelegraph, Decrypt, CoinDesk (live). Exchange
      announcements + economic calendar as provider INTERFACES (architecture-ready).
- [x] **Normalization** — raw provider item → canonical `Insight`. No provider format
      escapes this layer.
- [x] **Entity extraction** — dictionary of coins/exchanges/projects/chains/
      stablecoins → structured entities on each insight.
- [x] **Classification** — DETERMINISTIC category + severity + impact from keyword
      rules. No AI, no sentiment, no price prediction.
- [x] **Deduplication** — merge the same story across providers; preserve every
      source and publish time.
- [x] **Risk flags** — standardized flags (severity / reason / affected assets /
      expiry / evidence). Corroboration rule (2+ sources) before a veto fires.
- [x] **Repository + timeline + search + collection worker.**
- [x] **Read API** — `/insights` (feed), timeline, search. Admin health metrics.

## Frontend (app stays live — owner directive)

- [x] **Wire the Insights page** to the real `/insights` feed; retire `mock-insights`.
      News + risk flags are LIVE; social + fundamentals are honestly empty
      (architecture-only — no live source yet), labelled as such.

## Close-out

- [x] Tests (classification, dedup, entity extraction, risk flags, normalization,
      determinism). docs/16-INSIGHTS.md. AGENTS.md. Full suite.
- [x] Verify live in the browser. Commit M12. **STOP** for approval before M13.

---

### Notes / instructions

- **Context, never prediction.** Impact is POSITIVE/NEGATIVE/NEUTRAL/UNKNOWN market
  *relevance*, never a price forecast. Classification is rule-based and testable.
- **The Risk Flag is the one thing insights may DO** — a veto (ADR-023 §5), and it
  requires corroboration. Everything else is awareness only; it must never inflate
  confidence or publish a trade.
- **Social / on-chain / AI summary are architecture-only** this milestone (out of
  scope): clean interfaces, empty output, honestly labelled — never faked.
- **Determinism:** the same article always classifies the same way. No clock reads
  in the classifier; `now` injected where needed.
