import { Injectable } from "@nestjs/common";
import type {
  InsightCategory,
  InsightEntity,
  InsightImpact,
  InsightSeverity,
} from "@aegis/contracts";

export interface Classification {
  category: InsightCategory;
  severity: InsightSeverity;
  impact: InsightImpact;
  tags: string[];
  /** How sure the CATEGORY match is, 0–1. Not a trade confidence. */
  confidence: number;
}

/**
 * What kind of event is this, how severe, does it tend to matter?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY ANSWER IS A RULE YOU CAN READ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no model here. Classification is an ordered list of keyword rules, and
 * the FIRST that matches wins. This is a deliberate choice, not a shortcut:
 *
 *   - It is DETERMINISTIC. The same headline always classifies the same way, so a
 *     replay reproduces history exactly and a benchmark (FTX, the Merge, an ETF
 *     approval) has one correct answer that can be asserted.
 *   - It is AUDITABLE. When the engine calls a story a HACK, you can point at the
 *     word that decided it. A black box that says "SECURITY, 0.82" and cannot show
 *     its reasoning is exactly what this platform refuses to ship.
 *   - It fails SAFE. Nothing matched → GENERAL / INFORMATIONAL / UNKNOWN, low
 *     confidence. It never guesses a coin into a crisis it is not in.
 *
 * The ORDER matters and encodes priority: a story that is both a "hack" and a
 * "partnership" is a hack. Danger outranks everything, because the cost of missing
 * a security event is far higher than the cost of mislabelling good news.
 */
@Injectable()
export class ClassificationEngine {
  classify(title: string, description: string, entities: readonly InsightEntity[]): Classification {
    const text = `${title} ${description}`.toLowerCase();

    for (const rule of RULES) {
      if (rule.match.some((kw) => text.includes(kw))) {
        return {
          category: rule.category,
          severity: rule.severity(entities),
          impact: rule.impact,
          tags: dedupe([rule.category.toLowerCase(), ...rule.tags]),
          confidence: rule.confidence,
        };
      }
    }

    /* Nothing matched. Honest defaults, low confidence — never a guess dressed up. */
    return {
      category: "GENERAL",
      severity: "INFORMATIONAL",
      impact: "UNKNOWN",
      tags: ["general"],
      confidence: 0.2,
    };
  }
}

/* ── The rules, in priority order ──────────────────────────────────── */

interface Rule {
  category: InsightCategory;
  match: string[];
  impact: InsightImpact;
  tags: string[];
  confidence: number;
  /** Severity can depend on how many/which assets are hit. */
  severity: (entities: readonly InsightEntity[]) => InsightSeverity;
}

/** A named-asset event is more severe than a market-wide one — it is actionable. */
const namedOr =
  (named: InsightSeverity, market: InsightSeverity) =>
  (entities: readonly InsightEntity[]): InsightSeverity =>
    entities.some((e) => e.kind === "COIN" || e.kind === "STABLECOIN") ? named : market;

const always = (s: InsightSeverity) => () => s;

const RULES: Rule[] = [
  /* ── Danger first — the cost of missing these is the highest ──────── */
  {
    category: "EXPLOIT",
    match: ["exploit", "drained", "drainer", "reentrancy", "flash loan attack"],
    impact: "NEGATIVE",
    tags: ["security", "risk"],
    confidence: 0.9,
    severity: always("CRITICAL"),
  },
  {
    category: "HACK",
    match: ["hack", "hacked", "stolen", "breach", "compromised", "private key", "rug pull", "rugpull"],
    impact: "NEGATIVE",
    tags: ["security", "risk"],
    confidence: 0.9,
    severity: always("CRITICAL"),
  },
  {
    category: "SECURITY",
    match: ["vulnerability", "security incident", "phishing", "malware", "backdoor"],
    impact: "NEGATIVE",
    tags: ["security"],
    confidence: 0.75,
    severity: namedOr("HIGH", "MEDIUM"),
  },
  {
    category: "REGULATION",
    match: ["sec ", "lawsuit", "sues", "regulat", "ban", "banned", "investigation", "subpoena", "settlement", "court", "fine", "sanction"],
    impact: "NEGATIVE",
    tags: ["regulation", "macro"],
    confidence: 0.7,
    severity: namedOr("HIGH", "MEDIUM"),
  },
  {
    category: "DELISTING",
    match: ["delist", "delisting", "removal of", "trading suspended", "suspends trading"],
    impact: "NEGATIVE",
    tags: ["exchange", "risk"],
    confidence: 0.85,
    severity: always("HIGH"),
  },
  {
    /* A depeg is a security-class event; the "depeg" tag is what the Risk Flag
     * generator keys on to raise a DEPEG veto. */
    category: "SECURITY",
    match: ["depeg", "de-peg", "lost its peg", "broke peg"],
    impact: "NEGATIVE",
    tags: ["stablecoin", "depeg", "risk"],
    confidence: 0.9,
    severity: always("CRITICAL"),
  },

  /* ── Macro ────────────────────────────────────────────────────────── */
  {
    category: "MACRO",
    match: ["fomc", "cpi", "ppi", "interest rate", "rate decision", "federal reserve", "fed ", "inflation", "gdp", "jobs report", "nonfarm", "unemployment", "jerome powell"],
    impact: "NEUTRAL",
    tags: ["macro"],
    confidence: 0.8,
    severity: always("HIGH"),
  },

  /* ── Exchange operations ──────────────────────────────────────────── */
  {
    category: "MAINTENANCE",
    match: ["maintenance", "wallet maintenance", "system upgrade", "scheduled downtime", "api incident", "degraded performance"],
    impact: "NEUTRAL",
    tags: ["exchange", "infrastructure"],
    confidence: 0.75,
    severity: always("MEDIUM"),
  },
  {
    category: "LISTING",
    match: ["listing", "will list", "lists ", "now available", "launchpool", "new pair"],
    impact: "POSITIVE",
    tags: ["exchange", "listing"],
    confidence: 0.75,
    severity: namedOr("MEDIUM", "LOW"),
  },

  /* ── Tokenomics / protocol ────────────────────────────────────────── */
  {
    category: "TOKENOMICS",
    match: ["token unlock", "unlock", "vesting", "token burn", "buyback", "emission"],
    impact: "NEGATIVE",
    tags: ["tokenomics", "risk"],
    confidence: 0.7,
    severity: namedOr("MEDIUM", "LOW"),
  },
  {
    category: "GOVERNANCE",
    match: ["governance", "proposal", "dao vote", "on-chain vote", "referendum"],
    impact: "NEUTRAL",
    tags: ["governance"],
    confidence: 0.65,
    severity: always("LOW"),
  },
  {
    category: "INFRASTRUCTURE",
    match: ["mainnet", "hard fork", "network upgrade", "the merge", "halving", "testnet"],
    impact: "POSITIVE",
    tags: ["infrastructure", "technology"],
    confidence: 0.7,
    severity: namedOr("MEDIUM", "LOW"),
  },
  {
    category: "LIQUIDITY",
    match: ["liquidity", "tvl", "total value locked", "netflow", "outflow", "inflow"],
    impact: "NEUTRAL",
    tags: ["liquidity"],
    confidence: 0.55,
    severity: always("LOW"),
  },
  {
    category: "PARTNERSHIP",
    match: ["partnership", "partners with", "integration", "collaborat", "teams up"],
    impact: "POSITIVE",
    tags: ["partnership"],
    confidence: 0.6,
    severity: always("LOW"),
  },
  {
    category: "PROTOCOL",
    match: ["protocol", "smart contract", "upgrade", "v2", "v3", "deploys"],
    impact: "NEUTRAL",
    tags: ["protocol", "technology"],
    confidence: 0.5,
    severity: always("LOW"),
  },
  {
    category: "TECHNOLOGY",
    match: ["launches", "unveils", "announces", "introduces", "rollout"],
    impact: "POSITIVE",
    tags: ["technology"],
    confidence: 0.45,
    severity: always("INFORMATIONAL"),
  },
];

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
