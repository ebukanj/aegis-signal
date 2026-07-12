# Aegis Signal — Strategy Specifications

**Governed by:** [AGENTS.md](../AGENTS.md) — the constitution and ownership map.
**Owner of:** all strategy logic. Entry rules, exits, filters, confidence
factors and expectancy models live here and **nowhere else**. Code implements
this document; it never invents rules of its own.

> **Status: none of these strategies has been implemented, backtested, or
> validated.** Every win rate, R-multiple and expectancy figure below is a
> *design hypothesis* — a target to be tested, not a result that was measured.
> No strategy may generate a live signal until it has passed backtest, then
> paper trading. See [02-FOUNDING_PRINCIPLES](02-FOUNDING_PRINCIPLES.md) P14
> (Continuous Validation).

---

Strategy Module Specifications v1.0
Scope: 5 fully-specified, rules-based strategy modules designed to run as independent, toggleable modules inside a signal-scanning platform. Every rule below is deterministic — a machine can evaluate it with no discretion. Together the 5 modules cover: Momentum Breakout, Trend Following, Mean Reversion, Scalping + Support/Resistance (merged into one module), and an AI-assisted Social/Fundamental Intelligence strategy.
Honest engineering note (read before building): No strategy is "profitable" until your backtest on your data proves it. The win rates and R-multiples below are design targets based on how these edge classes have historically behaved — treat them as hypotheses. Your platform MUST include a backtest/forward-test harness per module before any signal goes live, and every module should log every signal so realized expectancy can be compared against target expectancy. A module whose rolling 50-trade expectancy goes negative should auto-disable.
Universal expectancy formula (used by every module):
Expectancy (R) = (WinRate × AvgWin_R) − (LossRate × AvgLoss_R)
Expectancy ($) = Expectancy(R) × RiskPerTrade($)
Break-even WinRate = 1 / (1 + R:R)
Example: R:R = 2.0 → break-even win rate = 1/(1+2) = 33.3%. Any win rate above that is positive expectancy.
Universal position sizing formula (all modules):
PositionSize (units) = (AccountEquity × Risk%) / |Entry − StopLoss|
Futures: Leverage = min(ModuleLeverageCap, NotionalNeeded / MarginAllocated)
Risk is ALWAYS defined by the SL distance, never by leverage. Leverage only determines margin efficiency.
Universal signal-quality gates (applied before ANY module fires):
1.	24h quote volume of the pair ≥ $50M (liquidity gate; prevents slippage/manipulation).
2.	Spread ≤ 0.05% of price.
3.	No signal within 15 minutes before/after tier-1 macro events (FOMC, CPI) — futures modules only.
4.	Confidence score ≥ 75% (see per-module scoring). Signals scoring 60–74% can be logged as "watchlist" but not alerted.
________________________________________
STRATEGY 1 — "Ignition" | Momentum Breakout (Futures)
Objective: Capture the expansion leg that follows a volatility contraction, entering on a confirmed range breakout with volume ignition.
Market: Futures (USDT-M perpetuals). Long and short. Timeframe: 1H primary, 4H for trend filter. Leverage cap: 3x. Risk per trade: 1.0% of equity. Max concurrent positions: 3. Max daily loss: 3% (module auto-pauses 24h).
Entry Conditions (ALL must be true — LONG)
1.	Squeeze setup: Bollinger Band Width (20, 2) on 1H is in the lowest 20th percentile of its last 120 bars (volatility contraction).
2.	Range defined: Highest high of last 20 closed 1H bars = RangeHigh.
3.	Breakout trigger: 1H candle CLOSES above RangeHigh (close-basis only; wick breaks do not count).
4.	Volume ignition: Breakout candle volume ≥ 1.5 × SMA(volume, 20).
5.	Trend alignment: Price > 200 EMA on 4H, and 4H EMA(50) > EMA(200).
6.	Funding filter: Current funding rate between −0.01% and +0.03% per 8h. If funding > +0.05%, longs are crowded — skip.
7.	RSI(14) on 1H between 55 and 75 (momentum present, not blow-off).
Shorts: mirror all conditions (close below 20-bar low, price < 200 EMA on 4H, funding between −0.03% and +0.01%, RSI 25–45).
Price Rules
•	Entry: Market/limit at close of the breakout candle, or limit retest order at RangeHigh valid for 3 bars (whichever fills first; cancel the other).
•	Stop Loss (invalidation-based): Entry − 1.2 × ATR(14, 1H), but never inside the range — if that lands above RangeHigh − 0.25 × ATR, use RangeHigh − 0.25 × ATR instead. Typical SL distance: 1.5–2.5%.
•	Take Profit 1: Entry + 1.5 × SL-distance (close 50%, move SL to breakeven).
•	Take Profit 2: Entry + 3.0 × SL-distance, OR trail remaining 50% with a 2 × ATR chandelier stop — whichever the user configures.
•	Time stop: If neither TP1 nor SL hits within 12 × 1H bars, close at market (dead breakout).
Confidence Score (base 60, cap 95)
Factor	Points
Volume ≥ 2.0× SMA20 (vs required 1.5×)	+8
BB width in lowest 10th percentile	+7
4H AND Daily both above 200 EMA	+8
Breakout candle body ≥ 70% of its range	+5
Open interest rising on breakout bar	+7
Funding > +0.05% (crowded)	−15
Breakout into 4H resistance within 1 ATR	−10
Best / Avoid Conditions
•	Best: Post-consolidation regimes, BTC daily ATR% between 2–5%, clear higher-timeframe trend.
•	Avoid: Choppy/ranging BTC (ADX(14) on 4H < 18 → module suppresses all signals), weekends with volume < 60% of weekly average, first hour after major listings/news.
Expectancy Model (targets to validate)
Target WinRate = 42%, AvgWin = +2.1R (blend of TP1/TP2), AvgLoss = −1.0R
Expectancy = (0.42 × 2.1) − (0.58 × 1.0) = 0.882 − 0.58 = +0.302R per trade
At 1% risk, 40 trades/month → ≈ +12.1% expectancy/month before fees.
Break-even win rate at 2.1R = 32.3% → 9.7-point edge cushion.
Alert Format
LONG SIGNAL — IGNITION (Momentum Breakout)

Coin: SOLUSDT (Perp)
Entry: 145.30
Stop Loss: 142.40  (−2.0%, 1.2×ATR below breakout)
Take Profit 1: 149.65  (+1.5R, close 50%)
Take Profit 2: 154.00  (+3.0R)
Leverage: 3x | Risk: 1.0% | Position: auto-sized
Confidence: 87%

Reason:
• 1H close above 20-bar range high (144.90)
• Volume 2.3× average — ignition confirmed
• BB squeeze (8th percentile width) resolving up
• 4H & Daily above 200 EMA
• Funding +0.008% — not crowded
________________________________________
STRATEGY 2 — "Tidewater" | Trend Following & Accumulation (Spot)
Objective: Accumulate strong assets during confirmed uptrends and pyramid on pullbacks; exit only on structural trend failure. Built for spot — no liquidation risk, so stops are wide and structural.
Market: Spot only. Long only. Top-30 market-cap assets + user whitelist. Timeframe: Daily primary, 4H for entry timing. Risk per initial entry: 1.5% of equity (wider stop, spot). Max allocation per asset: 15% of portfolio. No leverage.
Entry Conditions (ALL must be true)
1.	Regime: Daily close > 200 EMA for ≥ 5 consecutive days, AND EMA(21) > EMA(55) > EMA(200) (fanned stack).
2.	Relative strength: Asset's 30-day return > BTC's 30-day return (buy leaders, not laggards). For BTC itself, compare vs. the total-market index.
3.	Pullback entry (timing, on 4H): Price pulls back to the zone between Daily EMA(21) and EMA(55), AND 4H RSI(14) drops below 45 then closes back above 50, AND a 4H candle closes above the prior 4H candle's high (shift confirmation).
4.	Volume: Pullback occurred on declining volume (SMA(vol,5) < SMA(vol,20) during the pullback leg).
Pyramiding rule (accumulation)
•	Add 0.75% risk (half-size) each time conditions 3–4 re-trigger, up to 3 total tranches, ONLY if the position is already ≥ +1R in profit. Weighted stop recalculated after each add.
Price Rules
•	Entry: Limit at the 4H confirmation close.
•	Stop Loss (structural, wide): Daily close below EMA(55) AND below the most recent Daily swing low (both required — evaluated on daily close only, not intrabar). Typical distance 8–15%. Optional user mode "HODL": no hard stop; instead a 50% de-risk on Daily close < 200 EMA.
•	Take Profit: No fixed TP. Scale out 25% at +2R and 25% at +4R; trail the rest with the structural stop. Full exit if Daily EMA(21) crosses below EMA(55).
•	Re-entry: Allowed after exit if all entry conditions re-form (min 3-day cooldown).
Confidence Score (base 60, cap 95)
Factor	Points
30-day RS vs BTC in top quartile of scanned universe	+10
Pullback held above EMA(21) (shallow)	+8
Weekly close also above weekly EMA(21)	+7
On-chain/exchange netflow negative (coins leaving exchanges), if data available	+5
Days-above-200EMA > 30	+5
Pullback deeper than EMA(55) intraday	−10
BTC below its own daily 200 EMA	−20
Best / Avoid Conditions
•	Best: Confirmed bull regimes (BTC > 200 EMA daily), post-halving expansion phases, alt seasons with rising total market cap.
•	Avoid: BTC < daily 200 EMA (module auto-suppresses), range-bound macro chop (Daily ADX < 15), assets with unlock/emission events within 14 days.
Expectancy Model (targets to validate)
Target WinRate = 48%, AvgWin = +3.2R (trailed winners), AvgLoss = −1.0R
Expectancy = (0.48 × 3.2) − (0.52 × 1.0) = 1.536 − 0.52 = +1.016R per trade
Low frequency: 3–6 signals/month across universe. Edge comes from R-multiple, not win rate.
Break-even win rate at 3.2R = 23.8%.
Alert Format
LONG SIGNAL — TIDEWATER (Spot Trend Accumulation)

Coin: ETHUSDT (Spot)
Entry: 3,412.00
Stop Loss: 3,020.00  (structural — daily close basis, −11.5%)
Scale-out 1: 4,196.00  (+2R, sell 25%)
Scale-out 2: 4,980.00  (+4R, sell 25%)
Trail: Daily EMA(55) / swing-low structure
Risk: 1.5% | Allocation cap: 15% | Tranche 1 of 3
Confidence: 84%

Reason:
• Daily EMA stack bullish (21>55>200), 41 days above 200 EMA
• Pullback to EMA(21) zone on fading volume
• 4H RSI reset (43 → 54) + shift candle confirmed
• Outperforming BTC by +9.2% over 30 days
________________________________________
STRATEGY 3 — "Rubber Band" | Mean Reversion (Futures)
Objective: Fade statistically overextended moves back to the mean in RANGING regimes, where breakout/trend modules are disabled. This module is the regime-complement of Ignition.
Market: Futures (USDT-M perps). Long and short. Majors only (BTC, ETH, SOL, BNB, XRP + top-15 by OI) — mean reversion on illiquid alts is how accounts die. Timeframe: 1H primary, 15M for entry trigger. Leverage cap: 2x (counter-trend = lowest leverage on the platform). Risk per trade: 0.75%. Max concurrent: 2. Max daily loss: 2.25% (3 losers) → auto-pause 24h.
Regime Gate (module only ACTIVE when):
•	4H ADX(14) < 20 (no trend), AND
•	Price has crossed the 4H EMA(50) at least 4 times in the last 60 bars (oscillation confirmed).
Entry Conditions (ALL must be true — LONG)
1.	Statistical stretch: 1H close < lower Bollinger Band (20, 2.0) AND Z-score of price vs 20-bar mean ≤ −2.2.
2.	RSI extreme + turn: 1H RSI(14) < 28, then RSI closes back above 30 (hook up).
3.	Divergence bonus (not required, scores points): price makes lower low while RSI makes higher low.
4.	No knife-catch filter: the down-leg is ≤ 3.5 × ATR(14) from the 20-bar mean. If price is further, it's a crash, not a stretch — skip.
5.	15M trigger: a 15M candle closes back above the 15M EMA(9).
6.	Funding filter: for longs, funding ≤ 0 or ≤ +0.01% (shorts not crowded against you is fine; deeply negative funding is a tailwind).
7.	No red-flag catalyst: no exchange/depeg/hack headline in the last 6h (feeds from the Strategy-5 news engine; if Strategy 5's risk flag is active on the asset, block).
Shorts: mirror (upper band, Z ≥ +2.2, RSI > 72 hooking down, funding ≥ 0 or crowded-long ≥ +0.03% is a bonus).
Price Rules
•	Entry: Limit at the 15M trigger close.
•	Stop Loss: min(recent 1H swing low, Entry − 1.0 × ATR(14,1H)) — tight and invalidation-based. Typical 1.0–1.6%.
•	Take Profit 1: the 20-bar SMA (the mean itself) — close 60% here.
•	Take Profit 2: the opposite Bollinger mid-to-upper zone: SMA20 + 0.5 × (UpperBand − SMA20) — close remaining 40%.
•	Hard rule: if TP1 < 1.2 × SL-distance at signal time, skip the trade (geometry too poor).
•	Time stop: flat after 8 × 1H bars if neither side hit — mean reversion decays fast.
Confidence Score (base 60, cap 95)
Factor	Points
Bullish/bearish RSI divergence present	+10
Z-score beyond ±2.5	+6
Touch of a mapped 4H S/R level (from Strategy 4's level engine)	+8
Funding strongly favorable (opposite side crowded)	+6
Volume climax on the extreme bar (≥2× SMA20)	+5
4H ADX between 20–25 (regime weakening)	−8
Entry counter to 4H EMA(200) slope	−7
Best / Avoid Conditions
•	Best: Sideways consolidation weeks, low-news weekends, post-expansion digestion ranges.
•	Avoid: Trending regimes (gate handles this), pre/post major macro prints, any asset with an active Strategy-5 risk flag, funding regime extremes signalling a squeeze.
Expectancy Model (targets to validate)
Target WinRate = 61%, AvgWin = +1.35R (blended TP1/TP2), AvgLoss = −1.0R
Expectancy = (0.61 × 1.35) − (0.39 × 1.0) = 0.8235 − 0.39 = +0.4335R per trade
Break-even win rate at 1.35R = 42.6% → 18-point cushion.
High frequency in range regimes: 30–60 signals/month across majors.
Alert Format
SHORT SIGNAL — RUBBER BAND (Mean Reversion)

Coin: BNBUSDT (Perp)
Entry: 612.40
Stop Loss: 619.80  (+1.2%, above 1H swing high)
Take Profit 1: 601.50  (20-SMA mean, close 60%)
Take Profit 2: 596.20  (close 40%)
Leverage: 2x | Risk: 0.75% | Time stop: 8h
Confidence: 82%

Reason:
• Z-score +2.6 above 20-bar mean, upper BB pierced
• 1H RSI 76 → hooked down through 72
• Bearish divergence vs prior high
• Funding +0.041% — longs crowded (squeeze fuel)
• Range regime confirmed (4H ADX 14)
________________________________________
STRATEGY 4 — "Sniper" | Support/Resistance Scalping (Futures)
Objective: High-frequency, small-target scalps off algorithmically mapped support/resistance levels on the 15M chart. Merges the Scalping and S&R modules into one engine: the S&R mapper is the level source, the scalper is the executor.
Market: Futures (USDT-M perps). Long and short. BTC, ETH, SOL only (deepest books; scalping needs minimal slippage). Timeframe: 15M execution, 1H/4H for level mapping. Leverage cap: 5x (tightest stops on the platform justify highest cap). Risk per trade: 0.5%. Max trades/day: 6 per asset. Max daily loss: 2% → hard stop for the day. Session filter: signals only during 07:00–21:00 UTC (overlap of EU/US liquidity).
Level Engine (runs continuously, feeds this module and others)
A price level L qualifies as S/R when:
1.	≥ 3 touches on 1H within the last 200 bars, each touch followed by a reversal ≥ 1.0 × ATR(14,1H), touches clustered within a band of 0.15 × ATR;
2.	OR it is: prior day high/low, weekly open, monthly open, or a 4H volume-profile HVN edge. Levels are ranked: LevelScore = touches × 2 + (reversal magnitude in ATR) + (confluences with round numbers / VP nodes).
Entry Conditions (LONG at support — ALL required)
1.	Price tags a mapped support level with LevelScore ≥ 7 (wick may pierce ≤ 0.2 × ATR(15M)).
2.	Rejection trigger: a 15M candle closes back above the level with a lower wick ≥ 50% of candle range (pin/hammer geometry), OR a 15M bullish engulfing at the level.
3.	Order-flow proxy: trigger-candle volume ≥ 1.3 × SMA(vol, 20) — absorption at the level.
4.	Micro-trend filter: 15M EMA(50) is flat-to-rising (slope over last 10 bars ≥ −0.05%/bar). Never long a support in a 15M waterfall.
5.	Spread/latency gate: book spread ≤ 0.03%; signal expires 2 bars after trigger (stale scalps are dead scalps).
Shorts at resistance: exact mirror.
Price Rules
•	Entry: Limit at trigger-candle close.
•	Stop Loss: Level − 0.5 × ATR(14, 15M) (below the level, not below entry). Typical 0.4–0.8%.
•	Take Profit 1: Entry + 1.0 × SL-distance — close 50%, SL → breakeven.
•	Take Profit 2: Entry + 2.0 × SL-distance, or the next mapped level if nearer (if next level < 1.5R away, skip trade — no room).
•	Time stop: 6 × 15M bars.
•	Fees rule (critical at this frequency): expected gross edge per trade must exceed 4 × (taker fee + est. slippage). At 0.05% taker, minimum viable SL distance ≥ 0.45%. The module rejects any signal that fails this arithmetic.
Confidence Score (base 60, cap 95)
Factor	Points
LevelScore ≥ 10	+8
Level confluent with VP node or round number	+6
Rejection wick ≥ 65% of range	+6
1H trend agrees with trade direction	+8
Funding favorable	+4
3rd+ test of the level within 24h (levels weaken)	−10
Within 30 min of macro print	−20 (blocks)
Best / Avoid Conditions
•	Best: Liquid sessions, defined ranges, normal-volatility days (15M ATR% between 0.3–0.9%).
•	Avoid: News candles, thin weekends, trending waterfalls (filter 4), first/last 15 min of daily candle rollover.
Expectancy Model (targets to validate)
Target WinRate = 56%, AvgWin = +1.3R (blended), AvgLoss = −1.0R
Gross Expectancy = (0.56 × 1.3) − (0.44 × 1.0) = 0.728 − 0.44 = +0.288R
Fees/slippage drag at scalp frequency ≈ −0.08R per trade →
Net Expectancy ≈ +0.208R per trade
Break-even (net of fees) win rate ≈ 47%. 80–120 trades/month potential.
NOTE: This module is the most fee-sensitive — expectancy MUST be tracked net.
Alert Format
LONG SIGNAL — SNIPER (S/R Scalp)

Coin: BTCUSDT (Perp)
Entry: 96,410
Stop Loss: 95,980  (−0.45%, below level 96,150)
Take Profit 1: 96,840  (+1R, close 50%, SL→BE)
Take Profit 2: 97,270  (+2R)
Leverage: 5x | Risk: 0.5% | Expires: 2 bars | Time stop: 90m
Confidence: 79%

Reason:
• Support 96,150 — LevelScore 11 (5 touches + weekly open confluence)
• 15M hammer rejection, wick 68% of range
• Absorption volume 1.6× average
• 1H trend up — trading with the tide
________________________________________
STRATEGY 5 — "Oracle" | AI-Assisted Social & Fundamental Intelligence (Spot + Futures)
Objective: Detect asymmetric information edges from social media, news, on-chain and developer activity BEFORE they are fully priced in — then require a TA confirmation gate so the platform never trades narrative alone. This module also exports a global Risk Flag feed consumed by all other modules (hacks, depegs, exploits, SEC actions → suppress signals on affected assets).
Market: Spot (accumulation mode) and Futures ≤ 2x (event mode). Timeframe: 4H and Daily. Sentiment is too noisy below 4H. Risk per trade: 1.0% (futures event mode) / 1.25% (spot accumulation). Max concurrent: 2.
5.1 Intelligence Pipeline (the "checks social media intelligently" part)
Data sources, polled continuously:
•	X/Twitter: filtered firehose on cashtags + curated list of ~500 high-signal accounts (core devs, founders, credible researchers). Engagement-weighted, bot-filtered.
•	Reddit: r/cryptocurrency + asset subreddits — post velocity and comment sentiment.
•	News APIs: CoinDesk/The Block/CryptoPanic-style feeds — entity extraction for listings, partnerships, upgrades, regulation, exploits.
•	On-chain: exchange netflows, whale-wallet transfers > $5M, active addresses (7d Δ).
•	Developer: GitHub commit velocity 30d Δ on the asset's core repos.
Signal construction (all computed per-asset, per-hour):
MentionZ      = (mentions_1h − mean(mentions, 30d)) / stdev(mentions, 30d)
SentScore     = LLM-classified sentiment ∈ [−1, +1], engagement-weighted,
                bot-score-filtered (accounts < 90d old or > 50 posts/day excluded)
CredWeight    = source tier multiplier (tier-1 verified/official = 3x,
                researcher = 2x, general = 1x)
NarrativeScore = MentionZ × SentScore × CredWeight_avg   (bounded ±10)
SmartFlow     = sign-weighted whale netflow + exchange outflow z-score
Anti-manipulation rules (mandatory):
•	Mention spikes where > 40% of volume comes from accounts < 90 days old → flagged as astroturf, signal blocked.
•	Single-source spikes (one viral post, no independent corroboration within 2h) → wait state, not signal.
•	Sentiment on assets < $300M market cap is NEVER traded (pump-and-dump territory).
•	Negative-event detection (hack/exploit/depeg keywords from tier-1 sources, 2-source confirmation) → immediate global Risk Flag, no long signals on the asset for 72h, all modules notified.
5.2 Entry Conditions (LONG — narrative + confirmation)
1.	Narrative trigger: NarrativeScore ≥ +4.0 sustained for ≥ 4 hours (not a single spike), OR a classified hard catalyst (major exchange listing confirmed, mainnet date set, tier-1 partnership) from ≥ 2 independent tier-1 sources.
2.	Freshness: price has moved < +8% since the earliest catalyst timestamp (edge not yet fully priced; if > 8%, too late — skip).
3.	TA confirmation gate (non-negotiable): 4H close > EMA(50), AND 4H volume ≥ 1.4 × SMA(20), AND price > VWAP anchored to the catalyst timestamp.
4.	SmartFlow ≥ 0 (whales not distributing into the narrative — if social is euphoric while whales send coins TO exchanges, that is a distribution signature: block longs, and in futures mode it becomes a SHORT setup candidate with mirrored rules).
Price Rules
•	Entry: limit at the 4H confirmation close.
•	Stop Loss: catalyst-anchored VWAP − 1.5 × ATR(14,4H) (spot mode may widen to the daily swing low). Typical 4–7%.
•	Take Profit 1: +2R (close 40%).
•	Take Profit 2: +4R, or exit 100% immediately if NarrativeScore decays below +1.0 for 12h (narrative death = thesis death), or on a SmartFlow distribution flip.
•	Event half-life rule: listings/partnership pops decay fast — futures event-mode positions auto-close after 72h regardless.
Confidence Score (base 55, cap 95)
Factor	Points
≥ 2 independent tier-1 sources	+12
SmartFlow strongly positive (exchange outflows + whale accumulation)	+10
GitHub velocity rising alongside narrative	+5
NarrativeScore ≥ 6 sustained 8h+	+6
TA gate passed with volume ≥ 2×	+7
Astroturf ratio 25–40% (below block threshold but elevated)	−12
Price already +5–8% from catalyst	−8
Best / Avoid Conditions
•	Best: Catalyst-rich periods (conference seasons, upgrade cycles, listing waves), early bull regimes where narratives get funded.
•	Avoid: Deep bear regimes (good news gets sold), low-cap assets, single-source hype, anything already vertical.
Expectancy Model (targets to validate)
Target WinRate = 45%, AvgWin = +2.6R, AvgLoss = −1.0R
Expectancy = (0.45 × 2.6) − (0.55 × 1.0) = 1.17 − 0.55 = +0.62R per trade
Low frequency by design: 4–10 signals/month. Break-even at 2.6R = 27.8%.
Alert Format
LONG SIGNAL — ORACLE (Social/Fundamental Intelligence)

Coin: ARBUSDT (Spot)
Entry: 1.142
Stop Loss: 1.078  (−5.6%, catalyst-VWAP − 1.5×ATR)
Take Profit 1: 1.270  (+2R, close 40%)
Take Profit 2: 1.398  (+4R) — or narrative-decay exit
Mode: Spot accumulation | Risk: 1.25%
Confidence: 88%

Reason:
• Hard catalyst: major exchange listing — confirmed by 2 tier-1 sources
• NarrativeScore +6.8, sustained 7h, astroturf ratio 9%
• Whale accumulation: −$18M exchange netflow (24h)
• Price only +3.1% since catalyst — edge not priced
• TA gate: 4H > EMA50, volume 2.1×, above catalyst VWAP
________________________________________
PLATFORM-LEVEL ARCHITECTURE NOTES
Regime router (recommended): Compute a global regime state — TRENDING (4H ADX ≥ 25), RANGING (ADX < 20), TRANSITION (20–25) — per asset. Route: TRENDING → Ignition/Tidewater active, Rubber Band suppressed; RANGING → Rubber Band/Sniper active, Ignition suppressed. This single feature prevents the classic failure of running counter-trend and breakout modules simultaneously on the same chart.
Per-module performance ledger (mandatory for your "compare strategies" feature): log for every signal — timestamp, asset, direction, entry/SL/TP, confidence, regime state, outcome in R, fees, slippage. Dashboard metrics per module: win rate, avg R, realized expectancy (rolling 50), profit factor, max drawdown, confidence-bucket calibration (do 90%+ signals actually win more than 75% signals? If not, the scorer needs retuning).
Kill switches: module auto-disables when rolling-50 expectancy < 0, or drawdown from module equity peak > 10%. Global: all futures modules pause if account drawdown > 8% in 7 days.
Confidence calibration: the % shown to users should eventually be mapped to empirical win probability from your ledger (e.g., signals scoring 85–90 historically win 58% → display calibrated probability, not raw score). This is what separates a professional platform from a bot printing "94%" decoratively.
Compliance note for your product: if this platform serves other users, signal services may fall under financial-promotion / investment-advice regulation in many jurisdictions (including Nigeria's SEC digital-asset rules). Get local legal advice before public launch, and display risk disclosures on every signal.
________________________________________
These specifications are engineering blueprints, not financial advice. All win rates and expectancy figures are design targets that must be validated by backtesting on your own data, then forward-tested on paper before real capital. Past patterns do not guarantee future results; leveraged trading can result in losses exceeding deposits.
________________________________________
________________________________________
EXPANSION PACK v1.1 — Strategies 6–10 (Edges Beyond Standard TA)
These five modules exploit data most retail signal bots ignore entirely: liquidation engines, funding/open-interest positioning, cross-asset capital flows, the derivatives basis, and session-structured liquidity. Together with modules 1–5 they complete the 10-module platform.
________________________________________
STRATEGY 6 — "Flush" | Liquidation Cascade Reversal (Futures)
Objective: Trade the violent snap-back that follows forced-liquidation cascades. When a wick is created by liquidations (not sellers/buyers with conviction), price tends to revert once the forced flow is exhausted. This is a mechanical edge — liquidation engines don't have opinions.
Market: Futures (USDT-M perps). Long and short. Top-20 by open interest. Timeframe: 15M execution, 1H context. Leverage cap: 3x. Risk per trade: 0.75%. Max concurrent: 2. Max daily loss: 2.25% → 24h pause. Data required: liquidation feed (exchange WebSocket or aggregator), open interest, CVD (cumulative volume delta).
Entry Conditions (LONG after a long-flush — ALL required)
1.	Cascade detection: liquidation volume in the last 15–30 min ≥ 4 × its 24h rolling 30-min average, ≥ 70% of it long liquidations.
2.	OI purge: open interest drops ≥ 3% within the cascade window (leverage actually flushed — without this, the move can continue).
3.	Displacement: the flush candle's range ≥ 2.5 × ATR(14, 15M) and it sweeps below a prior 1H swing low or mapped Sniper level (liquidity taken).
4.	Exhaustion + reclaim trigger: a 15M candle closes back ABOVE the swept level, AND CVD makes a higher low while price made a lower low (sellers were forced, not initiative).
5.	Funding snap: funding was ≥ +0.02% pre-flush and prints materially lower after (crowd cleared) — for long-flush reversals.
6.	No fundamental cause: Strategy-5 Risk Flag must be inactive. A flush caused by a hack headline is not a mechanical flush — block.
Shorts after a short-squeeze flush: exact mirror (short liquidations dominant, sweep above swing high, CVD lower high, funding was negative).
Price Rules
•	Entry: limit at the reclaim-candle close; signal expires after 2 × 15M bars.
•	Stop Loss: 0.35 × ATR(14,15M) below the flush wick low. If wick low is > 2.2% from entry, skip — geometry too wide for the edge.
•	Take Profit 1: the pre-cascade breakdown origin (where the cascade started) — close 50%, SL → breakeven. Typically 1.3–2R.
•	Take Profit 2: 15M VWAP of the day or the 1H EMA(50), whichever is nearer — close remainder.
•	Time stop: 8 × 15M bars. Snap-backs are fast or they are wrong.
Confidence Score (base 60, cap 95)
Factor	Points
Liquidation volume ≥ 6× average	+8
OI purge ≥ 5%	+8
Sweep of a Sniper level with LevelScore ≥ 8	+7
CVD divergence confirmed on 15M AND 5M	+6
Funding normalized ≥ 0.02 percentage points	+5
Cascade during thin liquidity (02:00–06:00 UTC)	−8 (less reliable snap-back)
BTC itself still falling impulsively (for alt signals)	−12
Best / Avoid Conditions
•	Best: Over-leveraged regimes (aggregate OI/market-cap elevated), weekends with crowded funding, post-run-up profit-taking zones.
•	Avoid: News-driven crashes (Risk Flag), macro print windows, first flush of a multi-leg deleveraging (require condition 2's OI purge — partial purges often get a second leg; if OI drop < 3%, stand aside).
Expectancy Model (targets to validate)
Target WinRate = 52%, AvgWin = +1.7R, AvgLoss = −1.0R
Expectancy = (0.52 × 1.7) − (0.48 × 1.0) = 0.884 − 0.48 = +0.404R per trade
Break-even at 1.7R = 37.0%. Frequency: 10–25 signals/month, clustered on volatile days.
Alert Format
LONG SIGNAL — FLUSH (Liquidation Reversal)

Coin: ETHUSDT (Perp)
Entry: 3,318.00
Stop Loss: 3,266.00  (−1.6%, below flush wick)
Take Profit 1: 3,401.00  (+1.6R, cascade origin, close 50%)
Take Profit 2: 3,447.00  (session VWAP)
Leverage: 3x | Risk: 0.75% | Expires: 30m | Time stop: 2h
Confidence: 86%

Reason:
• $41M long liquidations in 22 min (5.8× average)
• Open interest purged −4.7%
• Swept 1H swing low 3,280 and reclaimed on close
• CVD higher low vs price lower low — forced selling exhausted
• Funding +0.034% → +0.006% — crowd cleared
________________________________________
STRATEGY 7 — "Crowded Boat" | Funding & Open-Interest Squeeze (Futures)
Objective: Position against extreme, persistent crowd positioning in perpetual futures. When funding is at an extreme AND open interest is bloated AND price stops progressing, the crowded side becomes fuel for a move against it. This module trades positioning, not price patterns.
Market: Futures (USDT-M perps). Long and short. Top-15 by OI. Timeframe: 4H primary, 1H entry trigger. Slow, high-conviction module. Leverage cap: 2x (counter-crowd = patient sizing). Risk per trade: 1.0%. Max concurrent: 2.
Entry Conditions (SHORT the crowded longs — ALL required)
1.	Funding extreme: funding ≥ +0.08% per 8h (annualized ≈ 87%+) sustained across ≥ 3 consecutive funding intervals, OR predicted funding in the top 2nd percentile of the trailing 90 days.
2.	OI bloat: open interest at a 30-day high AND OI-to-market-cap ratio in the top decile of its 90-day range.
3.	Price stall (the trigger that separates this from knife-catching): despite the positioning, price has made NO new 4H closing high for ≥ 12 × 4H bars — longs are paying heavily and not being rewarded.
4.	Momentum crack: 1H close below EMA(21) with volume ≥ 1.3 × SMA(20), or a 1H lower-high/lower-low sequence forms.
5.	Long/short account ratio (if exchange provides): retail long ratio ≥ 65% adds confluence (scores points, not required).
Long the crowded shorts: mirror (funding ≤ −0.05% sustained, OI bloat, no new closing lows for 12 bars, 1H reclaim of EMA(21)).
Price Rules
•	Entry: limit on the 1H trigger close.
•	Stop Loss: above the most recent 4H swing high + 0.5 × ATR(14,4H). Typical 3–5%. Wide by design — positioning trades need room.
•	Take Profit 1: +1.5R (close 40%).
•	Take Profit 2: exit remainder when funding normalizes below +0.02% (the thesis — crowd cleared — has played out), or at +3R, whichever first.
•	Thesis stop: if funding normalizes < +0.02% while the trade is < +0.5R, exit at market — the edge is gone even if price hasn't moved.
•	Time stop: 7 days.
Confidence Score (base 55, cap 95)
Factor	Points
Funding in top 1st percentile (90d)	+10
OI/mcap top-5% extreme	+8
Retail long/short ratio ≥ 70% crowded	+7
Bearish divergence on 4H RSI at the stall highs	+7
Flush module fired same-direction in last 48h	+5
Strong trend still intact (Daily ADX ≥ 30)	−12 (crowds can stay right in trends)
Funding extreme < 2 intervals old	−8 (too early)
Best / Avoid Conditions
•	Best: Late-stage euphoric legs, post-listing hype, range tops/bottoms with stubborn positioning.
•	Avoid: Fresh strong trends (a crowded trend is not automatically wrong — hence conditions 3–4), low-OI assets, and never fade positioning without the price-stall condition.
Expectancy Model (targets to validate)
Target WinRate = 47%, AvgWin = +2.2R, AvgLoss = −1.0R
Expectancy = (0.47 × 2.2) − (0.53 × 1.0) = 1.034 − 0.53 = +0.504R per trade
Break-even at 2.2R = 31.3%. Low frequency: 3–8 signals/month. High average quality.
Alert Format
SHORT SIGNAL — CROWDED BOAT (Positioning Squeeze)

Coin: DOGEUSDT (Perp)
Entry: 0.1642
Stop Loss: 0.1721  (+4.8%, above 4H swing + 0.5 ATR)
Take Profit 1: 0.1523  (+1.5R, close 40%)
Take Profit 2: funding < 0.02% or +3R (0.1405)
Leverage: 2x | Risk: 1.0% | Thesis stop: funding normalization
Confidence: 83%

Reason:
• Funding +0.11%/8h for 4 straight intervals (99th percentile)
• OI at 30-day high; OI/mcap top decile
• No new 4H closing high in 14 bars — longs paying, not winning
• 1H broke EMA21 on 1.5× volume
• Retail 71% long
________________________________________
STRATEGY 8 — "Relay" | Relative-Strength Rotation & Ratio Trading (Spot)
Objective: Keep capital in whatever is strongest — systematically rotate between BTC, ETH, majors, and stables based on relative-strength ranking and dominance regime, and trade ratio pairs (e.g., ETH/BTC) directly. This module manages allocation, which drives more long-run P&L than any single entry trigger.
Market: Spot only. Universe: BTC, ETH + top-20 alts + stables (cash is a position). Timeframe: Daily rebalance scan; 4H for execution timing. Risk: portfolio-construction based, not per-trade: target portfolio held in the top-ranked bucket, rotated on rank change. Max 30% in any single non-BTC/ETH asset. Ratio trades: 1.0% risk each.
8.1 Regime Classifier (runs daily)
R1 BTC-season:   BTC > daily 200EMA AND BTC-dominance 20d slope > 0
R2 Alt-season:   BTC > 200EMA AND dominance slope < 0 AND ETH/BTC > its 50DMA
R3 Risk-off:     BTC < daily 200EMA  → rotate ≥ 60% to stables, only Tidewater-quality holds remain
R4 Transition:   mixed signals → 50% stables, half-size everything platform-wide
The regime state is broadcast to ALL modules (Tidewater suppressed in R3; futures modules half-risk in R4).
8.2 Rotation Rules
1.	Ranking: score every asset weekly: RS = 0.5×(30d return vs BTC) + 0.3×(90d return vs BTC) + 0.2×(volume trend 30d). Rank descending.
2.	Hold rule: own the top 3–5 ranked assets (user-configurable N), equal-weighted, ONLY those above their own daily 200 EMA.
3.	Rotation trigger: an asset is sold when it falls out of the top 2N ranks (buffer prevents churn) OR closes below its daily 200 EMA for 3 consecutive days.
4.	Churn guard: minimum hold 14 days unless the 200 EMA exit fires; max 2 rotations/week platform-wide.
8.3 Ratio-Pair Signals (tradable alerts, e.g., ETH/BTC)
•	LONG ETH/BTC when: ETH/BTC weekly close > 20-week SMA after ≥ 8 weeks below it, AND ETH/BTC daily RSI(14) > 55, AND dominance slope < 0. Execute by swapping BTC→ETH (spot), sized at the rotation weights.
•	Exit when ETH/BTC closes back below the 20-week SMA or daily RSI < 40.
•	Same template applies to SOL/ETH, ALT-index/BTC.
Confidence Score (base 60, cap 95)
Factor	Points
Asset in top-2 RS rank ≥ 2 consecutive weeks	+10
Regime R2 confirmed (alt-season) for alt signals	+8
Asset above 200 EMA ≥ 60 days	+6
Ratio breakout backed by rising volume on the numerator asset	+6
Regime R4 (transition)	−10
Rank driven by a single 3-day pump (return concentration > 70% in 3 days)	−12
Best / Avoid Conditions
•	Best: Bull regimes with sector rotation (L1s → L2s → memes etc.); this module shines exactly when single-asset strategies underperform by sitting in laggards.
•	Avoid: R3 risk-off (module's own classifier handles this by rotating to stables — "avoid" is built in), extremely correlated crash days (rotation adds nothing when everything is beta-1 to BTC).
Expectancy Model
Rotation is evaluated as portfolio alpha, not per-trade R:
Target: outperform buy-and-hold BTC by +8–15% annualized with ≤ 0.9× its drawdown.
Ratio trades: WinRate 44%, AvgWin +2.4R, AvgLoss −1.0R
Expectancy = (0.44 × 2.4) − (0.56 × 1.0) = 1.056 − 0.56 = +0.496R per ratio trade.
Benchmark every backtest against DCA-into-BTC — if the module can't beat that, ship it disabled by default.
Alert Format
ROTATION SIGNAL — RELAY

Action: SWAP 25% BTC → SOL (Spot)
Regime: R2 Alt-season (dominance slope −0.14%/d)
SOL RS rank: #1 (2 consecutive weeks) | 30d vs BTC: +18.4%
Entry timing: 4H pullback to EMA21 or market within 24h
Invalidation: SOL rank < #10 or daily close < 200 EMA ×3
Confidence: 85%

Reason:
• Top relative-strength rank, sustained
• Alt-season regime confirmed (ETH/BTC > 50DMA)
• SOL above 200 EMA for 74 days
• Volume trend +32% over 30d
________________________________________
STRATEGY 9 — "Harvest" | Delta-Neutral Funding Carry (Spot + Futures)
Objective: Earn funding-rate yield with near-zero price exposure: hold spot long + equal-notional perp short when funding is richly positive. This is the platform's income module — uncorrelated to every directional strategy, it prints during exactly the euphoric chop that hurts them. (Reverse carry — short spot via margin + long perp — only when funding is deeply negative, and only for advanced users.)
Market: Spot + USDT-M perp simultaneously, same asset. Majors with deep books. Timeframe: position held days-to-weeks; funding checked every 8h interval. Leverage on the perp leg: ≤ 2x margin efficiency (the position is hedged; leverage risk here is liquidation-gap risk, not direction). Allocation cap: ≤ 25% of portfolio in carry at once.
Entry Conditions (classic carry — ALL required)
1.	Yield threshold: funding ≥ +0.03% per 8h (≈ 32.9% annualized) averaged over the last 6 intervals, AND predicted next funding ≥ +0.03%.
2.	Persistence: ≥ 70% of the last 21 funding intervals (7 days) were positive.
3.	Basis sanity: perp price ≥ spot price (positive basis); entering when basis is negative gives up entry edge.
4.	Liquidity: both legs fillable within 0.05% slippage at intended size.
5.	Borrow/venue check: no elevated exchange-risk flag from Strategy 5 (carry concentrates counterparty risk — this is the module's REAL risk, not price).
Position Construction & Rules
•	Legs: buy spot X units; short perp X units (identical notional, same venue preferred to enable cross-margining).
•	Delta tolerance: rebalance when net delta drifts > 1% of notional (fees make tighter bands unprofitable).
•	Liquidation buffer: perp margin sized so liquidation price is ≥ 40% away from entry. On a violent pump, the spot leg gains what the perp loses — but ONLY if the perp isn't liquidated first. This buffer is the module's cardinal rule.
•	Exit: close both legs when (a) trailing 6-interval average funding < +0.01%, or (b) annualized yield net of fees < 12%, or (c) Strategy-5 exchange risk flag fires (exit immediately, spot leg first), or (d) a better carry (≥ 1.5× current yield) exists elsewhere and rotation covers round-trip fees within 5 days.
•	Fee math (must be positive before entry):
DaysToBreakeven = TotalRoundTripFees% / (AvgFunding%_per_day)
Enter only if DaysToBreakeven ≤ 3 and expected hold ≥ 3× that.
Confidence Score (base 60, cap 95)
Factor	Points
Annualized net yield ≥ 50%	+10
Funding positive 90%+ of last 21 intervals	+8
OI rising (crowd keeps paying)	+6
Cross-margined same-venue legs	+5
Yield spike < 24h old (may mean-revert instantly)	−10
Asset is a fresh listing < 30 days	−10
Best / Avoid Conditions
•	Best: Euphoric bull phases (funding stays rich for weeks), sideways-up grinds.
•	Avoid: Regime flips to risk-off (funding collapses — exit trigger handles it), venues with withdrawal irregularities, thin alts where closing the spot leg moves the market.
Expectancy Model
Not R-based — yield-based:
NetAnnualYield = AvgFunding_per_8h × 3 × 365 − FeesAnnualized − RebalanceCosts
Target: 15–45% annualized, price-delta ≈ 0, drawdowns limited to basis noise (±1–2%).
Primary risk is counterparty/venue, not market. Display this to users explicitly.
Alert Format
CARRY SIGNAL — HARVEST (Delta-Neutral)

Asset: SOLUSDT
Action: LONG spot 100 SOL @ 145.30 + SHORT perp 100 SOL @ 145.52
Current funding: +0.052%/8h (57% annualized)
7-day persistence: 20/21 intervals positive
Liquidation buffer: 43% | Breakeven: 1.4 days of funding
Exit: 6-interval avg funding < 0.01% or venue risk flag
Confidence: 89%

Reason:
• Funding 92nd percentile and persistent, not a one-off spike
• Positive basis +0.15% captured at entry
• OI rising — payers still crowding in
• Net projected yield ≈ 51% annualized after fees
________________________________________
STRATEGY 10 — "Killzone" | Session Liquidity & Opening-Range Strategy (Futures)
Objective: Exploit the most repeatable time-based structure in crypto: the Asian session builds a range, and the London/New York opens resolve it — frequently via a false break (liquidity sweep) of one side before the true move. Two setups, one module: Sweep-Reversal (primary) and Confirmed Continuation (secondary).
Market: Futures (USDT-M perps). BTC, ETH, SOL. Long and short. Timeframe: 15M execution. Session anchors in UTC: Asia range = 00:00–07:00; London window = 07:00–10:00; NY window = 13:00–16:00. Leverage cap: 4x. Risk per trade: 0.5%. Max 2 trades/session window, 4/day. Max daily loss: 1.5%.
Setup A — Sweep & Reclaim (primary; ~70% of signals)
LONG conditions (ALL required):
1.	Asia range defined: AH = Asia high, AL = Asia low; range height between 0.6% and 2.5% of price (too small = noise, too big = trend day, skip).
2.	During the London or NY window, price wicks BELOW AL by ≥ 0.1 × range height, sweeping it.
3.	Within 4 × 15M bars, a 15M candle CLOSES back above AL (reclaim).
4.	CVD or volume delta on the reclaim bar is positive (buyers initiated the reclaim).
5.	Daily bias filter: only take sweep-longs when daily close > daily EMA(50), sweep-shorts when below (trade sweeps back INTO the higher-timeframe trend).
SHORT: mirror at AH.
Setup B — Confirmed Continuation (secondary)
If no sweep occurs and a 15M candle closes beyond the range by ≥ 0.25 × range height with volume ≥ 1.5 × SMA(20) AND in the direction of the daily EMA(50) bias → breakout entry, same management as Ignition but range-based:
•	SL at range midpoint; TP1 = 1 × range height from breakout, TP2 = 2 × range height.
Price Rules (Setup A)
•	Entry: limit at reclaim-candle close.
•	Stop Loss: 0.3 × ATR(14,15M) below the sweep wick low. Typical 0.5–0.9%.
•	Take Profit 1: Asia range midpoint — close 50%, SL → breakeven.
•	Take Profit 2: opposite side of the Asia range (AH for longs).
•	Time stop: end of the session window +2h, flat no matter what. This module NEVER holds overnight.
Confidence Score (base 60, cap 95)
Factor	Points
Sweep also took a Sniper mapped level / prior-day low	+8
Reclaim within 1–2 bars (fast rejection)	+7
Daily bias strongly aligned (price > EMA50 AND EMA50 rising)	+8
CVD divergence at the sweep low	+6
Monday or Friday session (statistically noisier)	−6
Macro print inside the session window	−20 (blocks)
Asia range < 0.8% (thin)	−8
Best / Avoid Conditions
•	Best: Normal-volatility weekdays, clean overnight ranges, trending daily bias.
•	Avoid: Trend days that never look back (Setup A skips; Setup B catches some), holiday sessions, macro-event days.
Expectancy Model (targets to validate)
Setup A target: WinRate 58%, AvgWin +1.4R, AvgLoss −1.0R
Expectancy = (0.58 × 1.4) − (0.42 × 1.0) = 0.812 − 0.42 = +0.392R
Setup B target: WinRate 44%, AvgWin +1.9R → (0.44×1.9) − (0.56×1.0) = +0.276R
Blended ≈ +0.36R per trade, 20–40 trades/month. Break-even (A) = 41.7%.
Alert Format
LONG SIGNAL — KILLZONE (Session Sweep & Reclaim)

Coin: BTCUSDT (Perp)
Entry: 96,240
Stop Loss: 95,890  (−0.36%, below sweep wick)
Take Profit 1: 96,760  (Asia midpoint, close 50%, SL→BE)
Take Profit 2: 97,310  (Asia high)
Leverage: 4x | Risk: 0.5% | Flat by: 12:00 UTC
Confidence: 88%

Reason:
• London open swept Asia low 96,050 (−0.19%) and reclaimed in 2 bars
• Sweep took prior-day low — double liquidity grab
• Positive delta on reclaim candle
• Daily bias long (price > rising EMA50)
________________________________________
UPDATED PLATFORM ARCHITECTURE NOTES (v1.1)
Module interplay map (the moat of the platform):
•	Strategy 5 (Oracle) exports Risk Flags → consumed by ALL modules (blocks 3, 6, 9 explicitly).
•	Strategy 4 (Sniper) exports the Level Engine → consumed by 3 (Rubber Band), 6 (Flush), 10 (Killzone) for confluence scoring.
•	Strategy 8 (Relay) exports the Regime State → gates 1, 2, 3 and half-sizes everything in R4.
•	Strategy 7 (Crowded Boat) and 6 (Flush) share the positioning-data pipeline (funding, OI, liquidations) with 9 (Harvest). Build these as shared services, not per-module code — that's what makes modules cheap to add later.
Portfolio-level risk (now mandatory with 10 modules):
•	Correlation cap: max 3 open directional positions in assets with 30d correlation > 0.8 to each other, across ALL modules combined.
•	Global heat cap: total open risk (sum of all live position risks) ≤ 4% of equity; new signals queue when the cap is hit, ranked by confidence.
•	Direction cap: net directional exposure (longs − shorts, ex-Harvest) ≤ 3 position-equivalents.
•	Harvest (delta-neutral) is excluded from heat but capped at 25% allocation and counted fully for venue-concentration risk.
Signal collision rules: if two modules fire opposite directions on the same asset within 4h, suppress both and log a "conflict" event (conflicts are themselves regime information — surface them on the dashboard). Same-direction stacking is allowed but total asset risk caps at 1.5%.
Data dependencies added in v1.1: liquidation feed, open interest, funding history + predicted funding, CVD/volume delta, long-short account ratios, session clocks. Budget for a derivatives-data aggregator subscription — modules 6, 7, and 9 are only as good as this feed.
Same disclaimer applies: all figures are design targets requiring backtest and paper-trade validation. Modules 6, 7, 9 depend on data quality more than logic quality — validate the feeds first.
________________________________________
________________________________________
v1.2 — THE ALL-WEATHER LAYER
Merge Notes (external document vs. this spec)
Adopted from the external document: the Strategy Evaluation Engine concept, Green/Yellow/Red health states, walk-forward validation, Monte Carlo trade-sequence simulation, minimum-trade-count reliability gates, and embedding live strategy statistics inside every alert. Rejected or hardened: non-deterministic conditions ("selling volume declining", undefined "orderbook buy pressure") were replaced with measurable equivalents; 5-minute scalping was excluded (fails the fee-viability arithmetic in Strategy 4); "activate top 3 strategies" was replaced with regime-conditional activation (a top-3 global ranking would happily run three trend modules into a range); and confidence scores are calibrated against the ledger, not asserted.
________________________________________
STRATEGY 11 — "Chameleon" | All-Weather Adaptive Meta-Engine
Objective: Ride every market type — bull trend, bear trend, range, volatility expansion, and risk-off — by never being one strategy. Chameleon detects the regime, ranks the 10 underlying modules by live realized expectancy in that regime, allocates risk budget to the statistical leaders, and de-risks the whole platform when conditions turn hostile. It is the module users enable when they want "the platform's best judgment."
Market: All (it inherits the markets of whatever modules it activates). Timeframe: Regime scan every 4H close; health scan daily; allocation rebalance weekly or on regime flip. Risk: governs the global heat cap (≤ 4% open risk) and distributes it. Chameleon itself never exceeds the per-module risk rules already defined.
11.1 Regime Classifier v2 (deterministic, evaluated on BTC + total-market index)
INPUTS (all on BTC unless noted):
  T  = Daily close vs 200EMA (+1 above / −1 below)
  S  = 4H ADX(14)
  V  = ATR(14,D) / SMA(ATR(14,D), 30)      [volatility ratio]
  D  = BTC-dominance 20d slope
  F  = aggregate funding percentile (90d)
  X  = Strategy-5 global Risk Flag count (24h)

REGIMES (first match wins):
  R5 RISK-OFF:        X ≥ 2 tier-1 flags, OR Daily drop ≥ 7% with V ≥ 2.0
  R1 TREND-BULL:      T=+1 AND S ≥ 25 AND EMA50 > EMA200 (Daily)
  R2 TREND-BEAR:      T=−1 AND S ≥ 25
  R3 VOL-EXPANSION:   V ≥ 1.5 AND S between 20–25 (direction unresolved)
  R4 RANGE:           S < 20 AND V < 1.3
  R0 TRANSITION:      anything else → half-risk platform-wide
11.2 Regime → Module Activation Matrix
Regime	ACTIVE (full risk)	REDUCED (half risk)	DISABLED
R1 Trend-Bull	1 Ignition, 2 Tidewater, 8 Relay, 9 Harvest	5 Oracle, 10 Killzone	3 Rubber Band,
<truncated 15390 bytes>

NOTE: The output was truncated because it was too long. Use a more targeted query or a smaller range to get the information you need.