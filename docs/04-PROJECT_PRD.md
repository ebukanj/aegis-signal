# PROJECT_PRD.md
**Product:** Aegis Signal  
**Version:** 1.0  
**Status:** Draft  
**Owner:** Aegis Signal Technologies  
**Governed by:** [AGENTS.md](../AGENTS.md) — the constitution and ownership map.  
**Related Documents:**  
- [01-PRODUCT_BIBLE.md](01-PRODUCT_BIBLE.md)
- [02-FOUNDING_PRINCIPLES.md](02-FOUNDING_PRINCIPLES.md)
- [03-ENGINEERING_PHILOSOPHY.md](03-ENGINEERING_PHILOSOPHY.md)
- [05-SOLUTION_ARCHITECTURE.md](05-SOLUTION_ARCHITECTURE.md)
- [adr/](adr/)

---

# Aegis Signal Product Requirements Document (PRD)

---

## 1. Executive Summary
Aegis Signal is an AI-powered Crypto Market Intelligence Platform that continuously monitors cryptocurrency markets, evaluates predefined quantitative trading strategies, validates every opportunity through multiple risk layers, and delivers institutional-grade trading intelligence to traders.

Unlike traditional signal groups or indicator-based trading tools, Aegis Signal is designed around deterministic strategy execution, explainable signals, measurable performance, and continuous validation.

The platform combines market data, quantitative analysis, AI-assisted explanations, backtesting, paper trading, and advanced analytics into one unified ecosystem.

The long-term vision is to become the operating system for crypto market intelligence.

---

## 2. Vision
To become the world’s most trusted platform for discovering, validating, and delivering high-quality cryptocurrency trading opportunities through data, transparency, and disciplined risk management.

---

## 3. Mission
Aegis Signal exists to help traders make better trading decisions by transforming complex market data into clear, explainable, and statistically validated trading intelligence.

The platform prioritizes:
- Market Intelligence
- Risk Management
- Strategy Evaluation
- Transparency
- Continuous Improvement

---

## 4. Problem Statement
Most crypto traders rely on fragmented tools:
- TradingView for charts
- Telegram groups for signals
- CoinMarketCap for prices
- Exchange dashboards for execution
- Separate websites for news
- Manual spreadsheets for performance tracking

This workflow is inefficient, inconsistent, and prone to emotional decision-making.

Existing signal providers often:
- Do not explain why signals exist.
- Cannot prove historical performance.
- Lack measurable confidence.
- Hide losing trades.
- Do not adapt to changing market conditions.

Aegis Signal solves these problems by centralizing market intelligence into a single platform.

---

## 5. Product Objectives
The platform shall:
- Continuously scan supported cryptocurrency exchanges.
- Evaluate every configured trading pair.
- Execute multiple independent trading strategies.
- Validate signals through centralized risk management.
- Rank signals by confidence and expected quality.
- Notify users in real time.
- Track every generated signal.
- Measure strategy performance automatically.
- Support historical backtesting.
- Support paper trading.
- Prepare for future automated trade execution.

---

## 6. Target Users

### Primary Users
- Crypto traders
- Professional traders
- Swing traders
- Scalpers
- Futures traders
- Spot investors

### Secondary Users
- Trading communities
- Crypto research firms
- Investment firms
- Quantitative researchers
- Portfolio managers

### Future Enterprise Users
- Hedge funds
- Prop trading firms
- Institutional crypto desks
- Signal providers
- Trading educators

---

## 7. Product Positioning
Aegis Signal is **not**:
- A Telegram signal group
- A copy-trading application
- A trading bot
- A simple indicator
- An AI prediction tool

Aegis Signal **is**:
- A Crypto Market Intelligence Platform
- A Quantitative Strategy Platform
- A Risk Intelligence System
- A Signal Intelligence Engine
- A Strategy Analytics Platform

---

## 8. Product Pillars
Every feature must strengthen one or more of these pillars.

* **Market Intelligence**: Continuously monitor markets.
* **Strategy Intelligence**: Execute deterministic strategy modules.
* **Risk Intelligence**: Validate every opportunity before it reaches the user.
* **Signal Intelligence**: Deliver only high-quality opportunities.
* **Analytics Intelligence**: Measure every strategy and every signal.
* **AI Intelligence**: Explain signals, summarize market conditions, and assist users without replacing deterministic strategy logic.

---

## 9. Design Philosophy
The interface must communicate confidence, clarity, and professionalism.

Design inspiration may be drawn from products such as CoinMarketCap, TradingView, DefiLlama, Bloomberg Terminal, Stripe Dashboard, and Linear. The goal is inspiration—not imitation.

### Design Principles
- Dark-first interface.
- Minimal visual clutter.
- Fast loading.
- High information density without overwhelming the user.
- Consistent spacing and typography.
- Accessible color usage.
- Responsive across desktop, tablet, and mobile.
- Smooth but subtle animations.
- Charts should be interactive and easy to interpret.
- Every page should answer a single primary question.

---

## 10. User Experience Goals
The platform should allow users to understand the market within seconds.

Upon login, users should immediately know:
- Current market regime.
- Best trading opportunities.
- Highest-confidence signals.
- Overall market risk.
- Best-performing strategies.
- Recent notifications.
- Platform health.

Users should never need to search for critical information. The system should surface it proactively.

---

## 11. Success Criteria
Version 1.0 is considered successful when users can:
- View live market intelligence.
- Receive high-quality LONG and SHORT signals.
- Understand why every signal exists.
- Compare strategy performance.
- Backtest strategies.
- Simulate trades through paper trading.
- Receive notifications across multiple channels.
- Configure strategies without modifying code.

---

## 12. Scope

> **Amended by [ADR-023](adr/ADR-023-strategy-as-document.md) and [ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md).** Backtesting, Paper Trading and the
> Dashboard were **removed**: traders validate in TradingView or on a live
> exchange, and a page that summarises other pages is noise. The Analytics
> Center was gutted and rebuilt as **Track Record**. See [AGENTS.md §4](../AGENTS.md) for what
> actually exists.

### Version 1.0 includes:
- Multi-exchange market scanning.
- Strategy engine — **one evaluator reading strategy documents** ([ADR-023](adr/ADR-023-strategy-as-document.md)).
- Indicator engine and pattern engine ([ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)).
- Risk engine — the veto.
- Signal engine — confluence and the Prime budget.
- Confidence engine + calibration ([ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md)).
- The outcome ledger.
- Insights — news, social, fundamentals, and Risk Flags.
- Notification engine — Prime only.
- Track Record — the reliability curve.
- Administrative console.

### Explicitly NOT in Version 1.0:
- **Backtesting laboratory** — removed. Historical replay survives only as an
  internal calibration engine the user never operates.
- **Paper trading** — removed. The ledger records outcomes automatically.
- **Dashboard** — removed. Signals is the home page.
- **Automated execution** — Version 2.0.

### Future versions will introduce:
- Automated trade execution.
- Portfolio management.
- Subscription billing.
- Public API.
- Mobile applications.
- Strategy marketplace.
- Enterprise features.

---

## 13. Functional Requirements

### 13.1 Authentication
The platform shall provide:
- User Registration
- Secure Login
- Password Reset
- Two-Factor Authentication (Future)
- Session Management
- JWT Authentication
- Role-Based Access Control

#### User Roles
- Super Administrator
- Administrator
- Analyst
- Trader
- Read-Only User

---

### 13.2 Exchange Management
The platform shall support multiple cryptocurrency exchanges.

**Version 1.0:**
- Binance
- Bybit
- OKX
- Bitget
- KuCoin

Future versions shall allow additional exchanges without modifying the core architecture.

---

### 13.3 Market Data Collection
The platform shall continuously collect:
- OHLCV Candles
- Live Prices
- Trading Volume
- Order Book Snapshot
- Funding Rate
- Open Interest
- Liquidation Data
- Long/Short Ratio
- Exchange Statistics

The Market Intelligence Engine shall normalize all exchange data into a unified internal format.

---

### 13.4 Strategy Management
The platform shall support unlimited independent strategy modules.

Each strategy must:
- Be self-contained.
- Be independently configurable.
- Be independently testable.
- Be independently enabled or disabled.
- Maintain its own performance history.
- Expose its own health metrics.

Strategies must never directly communicate with each other. Communication occurs only through shared platform services.

---

### 13.5 Signal Generation
When strategy conditions are satisfied, the Signal Engine shall generate:
- Coin
- Exchange
- Strategy
- Direction (Long/Short)
- Entry Price
- Stop Loss
- Take Profit(s)
- Risk
- Confidence Score
- Market Regime
- Generated Timestamp
- Expiration Time
- Signal Explanation

Every generated signal must be permanently stored. No signal may be deleted.

---

### 13.6 Risk Validation
Every generated signal must pass through the Risk Engine before publication.

Validation includes:
- Liquidity checks
- Spread validation
- Market regime validation
- Strategy health validation
- Duplicate signal detection
- Correlation limits
- Portfolio heat limits
- Confidence threshold validation

Rejected signals shall be logged for analytics.

---

### 13.7 Notifications
Users may receive alerts through:
- Telegram
- WhatsApp
- Email
- Discord (Future)
- Slack (Future)
- Mobile Push Notifications (Future)

Notifications must be customizable. Users should configure:
- Confidence threshold
- Preferred strategies
- Exchanges
- Coins
- Risk level
- Notification frequency

---

### 13.8 Analytics
The Analytics Engine shall continuously compute:
- Win Rate
- Loss Rate
- Profit Factor
- Expectancy
- Drawdown
- Average Holding Time
- Average Risk/Reward
- Monthly Performance
- Yearly Performance
- Strategy Health

Analytics must be available globally and per strategy.

---

### 13.9 Backtesting
Users shall be able to:
- Select a strategy.
- Choose an exchange.
- Select a date range.
- Choose timeframes.
- Run historical simulations.

Backtesting results must include:
- Total Trades
- Winning Trades
- Losing Trades
- Win Rate
- Net Return
- Maximum Drawdown
- Profit Factor
- Expectancy
- Equity Curve
- Trade History

---

### 13.10 Paper Trading
The platform shall simulate live trading.

Features include:
- Virtual Portfolio
- Virtual Balance
- Position Tracking
- Performance Tracking
- Trade Journal
- Portfolio Growth
- Daily Reports

No real orders shall be sent.

---

## 14. Non-Functional Requirements

### Performance
The platform should process thousands of market updates efficiently.
- Dashboard load < 2 seconds.
- Signal generation < 500ms after strategy evaluation.
- Notification delivery < 5 seconds.
- Support concurrent market scanning.

### Availability
- Target uptime: 99.9%
- The platform shall recover automatically from scanner failures.

### Scalability
The architecture must support:
- Multiple exchanges.
- Thousands of trading pairs.
- Hundreds of strategies.
- Multiple users.
- Horizontal worker scaling.
- Future SaaS deployment.

### Reliability
The platform must gracefully handle:
- Exchange downtime.
- API failures.
- Missing market data.
- Internet interruptions.
- Worker crashes.
- Automatic retries shall be implemented where appropriate.

### Security
All sensitive information must be encrypted, including:
- API Keys
- User Passwords
- JWT Secrets
- Environment Variables

The principle of least privilege shall be followed.

### Maintainability
Every module must:
- Have clear ownership.
- Be independently testable.
- Be independently deployable within the modular monolith.
- Include documentation.

### Observability
Every subsystem shall expose:
- Health Status
- Logs
- Metrics
- Performance Statistics
- Error Reports

---

## 15. Platform Modules
The Aegis Signal platform consists of twelve primary subsystems.

1. **Market Intelligence Engine**: Responsible for collecting, normalizing, and distributing market data.
2. **Strategy Engine**: Executes every enabled strategy module. Produces candidate trading opportunities.
3. **Signal Intelligence Engine**: Transforms validated strategy outputs into structured trading signals. Ranks signals by quality.
4. **Risk Intelligence Engine**: Validates every opportunity, rejects unsafe signals, monitors portfolio risk, and controls platform-wide exposure.
5. **Market Regime Engine**: Determines whether the market is Trending Bullish, Trending Bearish, Ranging, High Volatility, Transitioning, or Risk-Off. This regime is shared across the platform.
6. **Chameleon Allocation Engine**: Activates and deactivates strategies based on current market regime, strategy health, historical performance, and live expectancy.
7. **Analytics Engine**: Measures platform, strategy, user performance, and signal quality. Provides dashboards and reports.
8. **Backtesting Laboratory**: Runs historical simulations and produces institutional-grade performance reports.
9. **Paper Trading Simulator**: Allows users to validate strategies in live market conditions without risking capital.
10. **AI Intelligence Layer**: Provides signal explanations, market summaries, news interpretation, strategy comparisons, and performance insights. The AI layer never modifies deterministic strategy logic.
11. **Notification Center**: Delivers alerts across configured channels, tracks notification delivery, and supports future escalation policies.
12. **Administration Center**: Allows administrators to manage users, configure exchanges, configure strategies, configure risk rules, monitor system health, view logs, and manage feature flags.

---

## 16. Product Modules (User Interface)

*Amended by [ADR-023](adr/ADR-023-strategy-as-document.md) / [ADR-024](adr/ADR-024-earned-confidence-and-the-pattern-vocabulary.md): ten workspaces became seven. What follows is
what the frontend actually ships.*

| Workspace | The one question it answers |
|---|---|
| **Signals** *(home)* | What should I trade today? |
| **Market Scanner** | What does the scan find with the rules *I* pick — and what did it reject? |
| **Strategies** | What are the rules, and are they mine to change? |
| **Insights** | What is happening — news, social, fundamentals — and what is blocked? |
| **Track Record** | Have these signals actually made money, and when we say 90 are we right 90% of the time? |
| **Notifications** | Where do Prime signals get delivered? |
| **Settings** *(+ Administration)* | Preferences, exchanges, platform management. |

**Removed:** Dashboard (a page summarising other pages), Backtesting Lab and
Paper Trading (jobs traders do better elsewhere), the Analytics Center (gutted
and rebuilt as Track Record).

---

## 17. Dashboard Requirements
The Dashboard is the primary workspace. It answers one question: *“What should I know right now?”*

The dashboard shall display:
- **Market Overview**: Global Market Regime, Overall Risk Level, Market Sentiment, BTC Dominance, Fear & Greed Index (Future).
- **Opportunity Summary**: High Confidence Signals, Medium Confidence Signals, Watchlist Opportunities.
- **Strategy Overview**: Active Strategies, Disabled Strategies, Best Performer, Worst Performer.
- **Portfolio Summary**: Paper Trading Performance, Recent Trades, Daily Performance.
- **Platform Health**: Scanner Status, Exchange Connectivity, Worker Health, Notification Status.
- **Activity Feed**: Latest Signals, Strategy Changes, Risk Warnings, System Events.

The dashboard must prioritize clarity over density and present actionable information before detailed analytics.

---

## 18. System Workflow
Aegis Signal follows a deterministic event-driven workflow. Every trading opportunity moves through the same validation pipeline before reaching the user. No module may bypass this workflow.

```
Exchange APIs
      │
      ▼
Market Intelligence Engine
      │
      ▼
Data Normalization
      │
      ▼
Market Regime Engine
      │
      ▼
Strategy Engine
      │
      ▼
Candidate Signal
      │
      ▼
Risk Intelligence Engine
      │
      ▼
Confidence Scoring Engine
      │
      ▼
Signal Ranking Engine
      │
      ▼
Signal Intelligence Engine
      │
      ▼
Database
      │
      ├────────► Analytics Engine
      │
      ├────────► Backtesting Engine
      │
      ├────────► Paper Trading
      │
      └────────► Notification Center
                      │
                      ▼
                End User
```

---

## 19. End-to-End Signal Lifecycle

### Stage 1 — Market Collection
The Market Intelligence Engine continuously collects price, volume, funding, open interest, liquidation data, order book, long/short ratio, market breadth, and exchange statistics.

### Stage 2 — Data Validation
Incoming data is validated for completeness, timestamp freshness, duplicate detection, exchange synchronization, and missing values. Invalid market data is discarded.

### Stage 3 — Market Regime Classification
The Market Regime Engine classifies the market into one of the supported regimes (Trending Bull, Trending Bear, Range, Transition, Risk-Off, Volatility Expansion). The detected regime is shared across all strategy modules.

### Stage 4 — Strategy Evaluation
Each enabled strategy independently evaluates the market. Outcomes can be: No Signal, Watchlist, Long Candidate, or Short Candidate. Each strategy produces a structured candidate.

### Stage 5 — Risk Validation
Every candidate passes through liquidity validation, spread validation, risk limits, portfolio exposure, correlation filter, duplicate detection, confidence threshold, and strategy health check. Only validated candidates proceed.

### Stage 6 — Confidence Scoring
The Confidence Engine calculates a normalized confidence score based on strategy quality, market regime, historical performance, current market conditions, risk assessment, and data quality. Confidence scores are calibrated against historical performance rather than arbitrary percentages.

### Stage 7 — Signal Ranking
Signals are ranked by expected quality, expected R multiple, confidence, historical success, and risk. Users see the highest-value opportunities first.

### Stage 8 — Signal Publication
Approved signals are stored permanently, displayed on the Dashboard, made available through APIs, sent to the Notification Center, included in Analytics, and made available for Paper Trading.

### Stage 9 — Performance Tracking
Every signal is continuously tracked (Opened, Expired, Hit Stop Loss, Hit Take Profit, Time to Target, Maximum Favorable Excursion, Maximum Adverse Excursion, Final R Multiple).

### Stage 10 — Strategy Feedback
Signal outcomes update strategy health, confidence calibration, expectancy, win rate, profit factor, and drawdown. The platform continuously evaluates itself.

---

## 20. User Journey

* **First Login**: The user immediately sees the current market regime, market risk, best opportunities, today's signals, and platform health. No configuration is required.
* **Discover Opportunities**: The user opens the Market Scanner, which displays ranked opportunities (Coin, Direction, Strategy, Confidence, Expected Risk, Expected Reward, Status) rather than raw market data.
* **Analyze Signal**: Selecting a signal opens the Signal Intelligence Page, showing an interactive chart, signal explanation, strategy used, regime, trade parameters (Entry, Stop Loss, Take Profit), risk assessment, historical performance, confidence breakdown, and AI commentary.
* **Validate Strategy**: The user inspects strategy health, historical performance, backtests, current status, and regime compatibility.
* **Paper Trade**: The user simulates execution, tracking performance in a virtual portfolio.
* **Learn**: AI explains why the signal exists, why other strategies disagreed, current market conditions, risk factors, and alternative scenarios.
* **Improve**: Analytics reveal the best and weakest strategies, highest-confidence signals, most profitable markets, and overall performance trends.

---

## 21. Screen Specifications

### Dashboard
- **Purpose**: Provide an executive overview of the market.
- **Primary Question**: *“What should I know immediately?”*
- **Widgets**: Market Regime, Market Risk, Today’s Opportunities, Signal Feed, Strategy Health, Scanner Status, Paper Portfolio, Notifications.

### Market Scanner
- **Purpose**: Discover opportunities.
- **Columns**: Rank, Coin, Exchange, Strategy, Direction, Confidence, Risk, Expected Return, Market Regime, Time Remaining.
- **Filters**: Exchange, Strategy, Confidence, Market Regime, Risk, Timeframe.

### Signal Details
- **Purpose**: Explain every opportunity.
- **Sections**: Signal Summary, Interactive Chart, Signal Explanation, Risk Assessment, Entry Plan, Exit Plan, Strategy Statistics, Historical Results, AI Commentary.

### Strategy Laboratory
- **Purpose**: Manage strategies.
- **Displays**: Status, Health, Expectancy, Profit Factor, Win Rate, Drawdown, Current Regime, Signals Generated, Configuration.

### Analytics Center
- **Purpose**: Measure everything.
- **Sections**: Platform Performance, Strategy Comparison, Signal Quality, Profit Distribution, Confidence Calibration, Portfolio Statistics, Risk Metrics.

### Backtesting Laboratory
- **Purpose**: Validate ideas.
- **Features**: Select Strategy, Configure Parameters, Run Simulation, Export Results, Compare Versions.

### Paper Trading
- **Purpose**: Build confidence.
- **Displays**: Portfolio, Open Trades, Closed Trades, Daily Return, Monthly Return, Trade Journal, Risk Analysis.

### Notification Center
- **Purpose**: Manage communication.
- **Configurations**: Channels, Minimum Confidence, Strategies, Timeframes, Coins, Frequency, Quiet Hours.

### Administration
- **Purpose**: Manage the platform.
- **Features**: Users, Roles, Strategies, Exchanges, Risk Rules, Workers, Logs, Health Monitoring, Feature Flags, System Configuration.

---

## 22. Version Roadmap

### Version 1.0 (Core Platform)
- Market Scanner
- Signal Engine
- Risk Engine
- Dashboard
- Backtesting
- Paper Trading
- Analytics
- Notifications
- AI Explanations

### Version 1.5
- Portfolio Tracking
- Advanced Analytics
- Multi-Workspace Dashboards
- Saved Layouts
- Strategy Marketplace (Read-Only)
- Performance Benchmarking

### Version 2.0
- Automated Trade Execution
- Broker Connections
- Portfolio Rebalancing
- Mobile Applications
- Public API
- Webhook Integrations
- Multi-Tenant SaaS
- Subscription Billing

### Version 3.0
- Institutional Workspace
- Team Collaboration
- Custom Quant Strategies
- Machine Learning Optimization
- Portfolio Intelligence
- Cross-Asset Analysis
- Enterprise APIs
- White-Label Platform

---

## 23. Success Metrics

### Technical KPIs
- Platform uptime ≥ 99.9%
- Signal latency < 500 ms after strategy evaluation
- Dashboard load < 2 seconds
- Notification delivery < 5 seconds
- Backtest completion within acceptable dataset-dependent limits

### Product KPIs
- High user engagement with daily active usage
- Increasing strategy accuracy over time
- Improved confidence calibration
- Reduced false-positive signals
- Successful onboarding of new strategy modules without architectural changes

### Business KPIs
- Subscriber growth
- User retention
- Premium feature adoption
- Strategy marketplace participation (future)
- Enterprise customer acquisition

---

## 24. Definition of Product Completion (Version 1.0)

> **These are acceptance criteria, not a status report.** Every box below is
> unchecked because none of it has shipped. Only check a box when the
> capability runs end-to-end against real data and is covered by tests. The
> authoritative status of the system is [AGENTS.md §4](../AGENTS.md).

Aegis Signal Version 1.0 is complete when:
- [ ] Users can authenticate securely.
- [ ] Supported exchanges stream normalized market data.
- [ ] Strategies execute independently.
- [ ] Signals are validated by the Risk Engine.
- [ ] Confidence scores are calibrated against realized outcomes and displayed.
- [ ] Notifications are delivered successfully.
- [ ] Dashboard provides actionable market intelligence.
- [ ] Backtesting produces reproducible results.
- [ ] Paper Trading mirrors live signal execution.
- [ ] Analytics continuously measure platform performance.
- [ ] AI provides explanations without influencing deterministic strategy logic.
- [ ] Documentation, testing, logging, and observability meet the standards defined by the Engineering Philosophy and Founding Principles.

Version 1.0 is considered production-ready only when these criteria are met and validated.

**No strategy has been backtested. Every expectancy figure in
[06-STRATEGIES.md](06-STRATEGIES.md) is a design hypothesis awaiting
validation, never a result.**

---

## Addendum A — Signal Model Evolution (v1.1, 2026-07-12)
Owner decision; full rationale in [ADR-021](adr/ADR-021-confluence-prime-signals-execution-guidance.md).

1. **Prime Signals**: the platform curates at most ~4–5 very-high-confidence
   signals per day ("Prime"), published whenever conditions are met. Only
   Prime signals trigger notifications. All validated signals remain visible
   in the Market Scanner for transparency.
2. **Strategy Confluence**: independent strategies agreeing on the same
   market/direction are fused into ONE signal crediting all contributing
   strategies, with a calibrated confidence uplift. Strategies remain
   independent plugins; fusion happens in the Signal Intelligence Engine.
3. **Execution Guidance**: every signal carries actionable execution fields
   decided by the Risk Engine — exchange, SPOT or PERPETUAL, suggested
   leverage (risk-capped), timeframe, entry, stop, targets — rendered as a
   one-sentence trade instruction a user can execute manually in seconds.
   Automated execution remains Version 2.0.
4. **Signal fields added** to §13.5: Contributing Strategies (list), Market
   Type, Suggested Leverage, Prime Status.
5. **Dashboard** (§17) additionally surfaces the single best current
   opportunity with its full trade instruction.
6. **Fundamental analysis** joins the confidence model as additional
   deterministic contributors fed by the AI layer (future minor version).
