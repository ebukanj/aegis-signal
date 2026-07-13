# Aegis Signal

## Architecture Decision Records (ADR)

**Version:** 1.0  
> "Good architecture is not only about making decisions. It is about remembering why those decisions were made."

---

## Purpose
This document establishes the Architecture Decision Record (ADR) process for Aegis Signal.

Every major architectural, engineering, technology, and product decision must be documented before implementation.

An Architecture Decision Record captures:
- The problem
- The available options
- The chosen solution
- The reasoning
- The consequences
- And future considerations

The goal is to preserve engineering knowledge as the platform evolves.

---

## Why Architecture Decision Records Exist
Software changes.  
People change.  
AI models change.  
Frameworks change.  

Without documented reasoning, future contributors may unknowingly reverse important architectural decisions.  
An ADR prevents architectural drift.

---

## Guiding Principles
Every significant decision should answer:
1. What problem are we solving?
2. Why is this decision necessary?
3. Which alternatives were considered?
4. Why was this option selected?
5. What trade-offs were accepted?
6. What future impact will this decision have?
7. Can this decision be changed later?

---

## When an ADR Is Required
Create an ADR whenever a decision affects:
- System architecture
- Technology selection
- Database design
- Infrastructure
- Security
- Deployment
- APIs
- Domain modeling
- Performance
- Scalability
- Strategy framework
- AI integration
- Risk management
- Major user workflows

*Minor implementation details do not require ADRs.*

---

## ADR Lifecycle
Every ADR has one of the following statuses:
- **Proposed**
- **Accepted**
- **Superseded**
- **Deprecated**
- **Rejected**

*Only Accepted ADRs define the current architecture.*

---

## ADR Numbering
Every decision receives a permanent identifier.  
**Example:**
- `ADR-001`
- `ADR-002`
- `ADR-003`

Numbers are never reused. If a decision changes, create a new ADR that supersedes the previous one.

---

## ADR Template
Every Architecture Decision Record must contain:

### Title
A concise description.

### Status
- Proposed
- Accepted
- Rejected
- Deprecated
- Superseded

### Context
Describe the problem. What constraints exist? Why is this decision required?

### Decision
Describe the chosen solution. Be specific.

### Alternatives Considered
List every serious alternative. Explain why each was rejected.

### Consequences
- Positive outcomes
- Negative outcomes
- Risks
- Maintenance implications
- Performance implications
- Future flexibility

### Implementation Notes
How the decision affects the codebase. Which modules are impacted. Migration considerations.

### References
Links to related documentation (e.g., related ADRs, Product Bible, Engineering Philosophy, PRD, Architecture).

---

## Engineering Rule
Never ask:
> "What did we decide?"

Ask:
> "Which ADR defines this?"

**ADRs are the single owner of architecture *decisions* and their rationale**
— that is their scope, assigned by the ownership map in
[AGENTS.md §2](../../AGENTS.md). They do not override AGENTS.md itself; an ADR
that contradicts the constitution must either be rejected, or accepted
*together with* the amendment to AGENTS.md that it requires.

---

## Accepted ADRs
- **[ADR-021](ADR-021-confluence-prime-signals-execution-guidance.md)** — Confluence Signals, Prime Signal Budget, Execution Guidance
- **[ADR-022](ADR-022-contract-first-backend.md)** — Frontend-First Sequencing and the Contract-First Backend
- **[ADR-023](ADR-023-strategy-as-document.md)** — Decongestion: Strategy as Document; Backtesting, Paper Trading and Dashboard removed

## Initial ADR Roadmap
The following Architecture Decision Records should exist before backend development completes.
*(ADR-021 and ADR-022 were written first because product direction and repository
structure demanded them; the backfill below remains outstanding.)*
- **ADR-001** — Modular Monolith Architecture
- **ADR-002** — Clean Architecture & Domain-Driven Design
- **ADR-003** — Technology Stack Selection
- **ADR-004** — Why NestJS
- **ADR-005** — Why Next.js
- **ADR-006** — Why PostgreSQL
- **ADR-007** — Why Redis & BullMQ
- **ADR-008** — Why CCXT for Exchange Integration
- **ADR-009** — TradingView for Visualization Only
- **ADR-010** — Strategy Plugin Architecture
- **ADR-011** — Event-Driven Communication
- **ADR-012** — AI as an Assistant Layer
- **ADR-013** — Modular Documentation Structure
- **ADR-014** — Deterministic Signal Engine
- **ADR-015** — Shared Risk Engine
- **ADR-016** — Shared Notification Engine
- **ADR-017** — Shared Analytics Engine
- **ADR-018** — Market Regime Router
- **ADR-019** — Chameleon Meta-Engine
- **ADR-020** — Security by Design

---

## Decision Ownership
Architecture decisions belong to the platform, not to individual contributors.

Every engineer and every AI agent must respect accepted ADRs. If an accepted ADR should change, create a new ADR explaining why. Never silently bypass an accepted architectural decision.

---

## Closing Statement
Architecture is a long-term investment. Every recorded decision reduces future uncertainty, preserves engineering intent, and protects the integrity of Aegis Signal.

The objective of the ADR process is not merely to document decisions. It is to ensure that Aegis Signal remains coherent, explainable, and maintainable as it evolves over time.
