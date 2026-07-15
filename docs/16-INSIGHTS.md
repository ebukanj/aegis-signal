# The Insights Engine — Context, Never Decisions

> The other engines analyse the market itself.
> This one analyses **the world around the market.**

It answers four questions — *what happened? who is affected? how severe? is it
relevant?* — and refuses a fifth. It never answers *"should we buy?"*. A story about
a coin is a reason to **look**, not a reason to act.

---

## 1. The one rule everything else serves

> **The Insights Engine never creates, rejects, or modifies a trading signal.**

Every trade still comes from a strategy document evaluated deterministically
(ADR-023). Nothing here bypasses that. The engine provides *awareness* — and
exactly one kind of action: a **Risk Flag** that STOPS a trade. When a coin has
just been exploited, hacked, delisted or depegged, no strategy gets an opinion on
it, however good the chart looks (ADR-023 §5, "Protect the Trader"). Awareness, and
a veto. Nothing between. It never inflates confidence, never sets leverage, never
predicts a price.

---

## 2. Deterministic, because a black box that says "bearish" is the enemy

There is **no model** in this engine. Classification is an ordered list of keyword
rules, and the first that matches wins. That is a deliberate choice:

- **Deterministic** — the same article always classifies the same way, so a
  benchmark (FTX, the Merge, an ETF approval) has one correct answer that can be
  asserted, and a replay reproduces history exactly.
- **Auditable** — when the engine calls a story a HACK, you can point at the word
  that decided it. "SECURITY, 0.82" from a model that cannot show its reasoning is
  exactly what this platform exists not to be.
- **Fails safe** — nothing matched → GENERAL / INFORMATIONAL / UNKNOWN, low
  confidence. It never guesses a coin into a crisis it is not in.

The rule ORDER encodes priority: **danger outranks everything.** A story that is
both a "hack" and a "partnership" is a hack, because the cost of missing a security
event is far higher than the cost of mislabelling good news.

"Impact" is market RELEVANCE (POSITIVE / NEGATIVE / NEUTRAL / UNKNOWN), never a
price forecast. UNKNOWN is a real answer and is never quietly promoted to NEUTRAL —
"we could not tell" and "it does not matter" are different facts.

---

## 3. The pipeline

```
real sources → collectors → normalize → deduplicate → classify
             → extract entities → risk flags → publish
```

- **Collectors** are pluggable and independent. The real ones are live RSS feeds
  (Cointelegraph, Decrypt, CoinDesk, Bitcoin Magazine); each is one row in a
  registry, not new code. They run with `allSettled` — one outlet changing its feed
  URL cannot take the others down — and each tracks its own **health** (last
  success, consecutive failures), because the worst failure a feed can have is to go
  quiet, and quiet looks exactly like "no news" until a trader misses the story that
  mattered.
- **Normalization** reduces every provider's format to one canonical `Insight`. No
  provider-specific field escapes this layer; a new source changes nothing
  downstream.
- **Entity extraction** is a curated dictionary, not NER — precision over recall.
  It matches whole words (so "eth" never fires inside "together") and fails safe (a
  coin not in the dictionary makes the story market-wide, never mis-attributed).

---

## 4. Deduplication is what makes corroboration real

Two outlets running the same story become **one** insight whose `sources` lists
both — merged by a fingerprint of the normalized, stemmed, stop-word-stripped title,
so "Binance to delist FTT" and "FTT delisted by Binance" collapse to one.

This is not tidiness. A Risk Flag requires **two independent sources**, and it
cannot count them if the same story sits in the database as four unrelated rows.
Deduplication is what lets the veto count corroboration at all. The merge preserves
every source and the earliest publication time (who broke it).

---

## 5. The Risk Flag — corroborated danger, and only that

The one thing insights may DO. A flag requires:

- a **flag-worthy category** (exploit, hack, delisting, depeg, high-severity
  regulation, an exchange outage, an imminent unlock),
- **two independent sources** — a veto on a single rumour hands anyone who can
  plant one story the power to suppress the platform's signals on a coin,
- a **named coin** to block — a market-wide security story is context, not a
  per-asset veto.

Each flag carries its severity, reason, affected asset, expiry and supporting
sources, and it **expires** — a block is not forever, though a delisting blocks for
a week because a delisting does not un-happen.

---

## 6. Architecture-only this milestone, and honest about it

Social intelligence, on-chain fundamentals and AI summarization are **out of scope**
here. They are built as clean interfaces and return **empty**, labelled — never
faked. The Insights page shows "not live yet" for social and fundamentals rather
than inventing chatter, and the market summary is a **deterministic** context line
(badged AUTO, not AI), never fabricated prose. A future-ready architecture means an
empty result behind a clean interface, not made-up data.

---

## 7. Verified on real, live news

One collection pass against the real feeds:

```
collected 99 insights in 2.3s from 4 sources — all HEALTHY
  Cointelegraph 30 · Decrypt 34 · CoinDesk 25 · Bitcoin Magazine 10

feed: 40 news · 0 risk flags
  [BEARISH] "Another DeFi Exploit: Perp DEX Ostium Loses $18M in Oracle Attack"
  [NEUTRAL] BTC  "Bitcoin Jumps Over $65,500 on Soft Inflation Data"
  [BULLISH] ETH,AVAX,AAVE  "Aave launches V4 on Avalanche"
```

Note the **0 risk flags** with real exploit stories in the feed — that is the
corroboration rule working, not a bug: those stories were single-source, or on a
coin outside the dictionary, so they remain *awareness* (classified BEARISH,
visible) rather than firing an uncorroborated veto. A veto is expensive, and the
engine refuses to raise one on a rumour.

`20` insights tests · `620` API tests — all green.

---

## 8. Out of scope

AI summarization · sentiment analysis · LLM reasoning · trade recommendations ·
signal generation · risk decisions · confidence adjustments. The engine provides
contextual intelligence and stops there. It publishes context to the Signal Detail
page, the Notification Engine, and the admin dashboard — and it must **never
directly influence trade publication.**
