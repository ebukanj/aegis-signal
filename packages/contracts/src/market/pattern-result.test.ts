import { describe, expect, it } from "vitest";
import { patternSchema, GEOMETRIC_PATTERNS, OBJECTIVE_PATTERNS } from "../strategy";
import { detectedPatternSchema, zoneSchema } from "./pattern-result";
import { PATTERN_WORDS } from "../strategy-language";

/**
 * THE REFUSAL, ENFORCED.
 *
 * `pattern-result.ts` has always claimed "there is a test asserting this".
 *
 * **There was not.** The comment was describing a guarantee nobody had written,
 * which is the most dangerous kind of documentation — it reads like a safety net
 * and it catches nothing. It exists now.
 *
 * ADR-024 rejected head & shoulders, cup & handle and Elliott waves because ten
 * traders draw them ten different ways. A "deterministic" detector for them would
 * not be detecting anything: it would pick one arbitrary interpretation, stamp a
 * quality score on it, and present the result as a measurement. That is
 * manufacturing certainty, which is the one thing this platform exists not to do.
 *
 * Milestone 05's brief asked for all of them. This test is why they are not here.
 */
describe("the vocabulary refuses the subjective patterns", () => {
  const REFUSED = [
    "HEAD_AND_SHOULDERS",
    "INVERSE_HEAD_AND_SHOULDERS",
    "CUP_AND_HANDLE",
    "ROUNDED_TOP",
    "ROUNDED_BOTTOM",
    "BROADENING_WEDGE",
    "ELLIOTT_WAVE",
  ];

  it.each(REFUSED)("refuses %s — it cannot be drawn the same way twice", (name) => {
    expect(patternSchema.safeParse(name).success).toBe(false);
  });

  it("a detected pattern carrying a refused name does not validate", () => {
    const result = detectedPatternSchema.safeParse({
      pattern: "HEAD_AND_SHOULDERS",
      timeframe: "1h",
      direction: "SHORT",
      quality: 0.9,
      strength: 0.8,
      detectedAt: 1_752_480_000_000,
      startedAt: 1_752_470_000_000,
      swings: [],
      triggerPrice: null,
      invalidationPrice: null,
      confirmed: true,
      breakoutPending: false,
      volumeConfirmed: true,
      evidence: [],
      weaknesses: [],
    });

    expect(result.success).toBe(false);
  });
});

/**
 * Every pattern in the vocabulary must be one or the other — objective or
 * geometric — and never both.
 */
describe("the vocabulary is fully classified", () => {
  it("every pattern is either objective or geometric, and none is both", () => {
    const all = patternSchema.options;

    for (const pattern of all) {
      const objective = (OBJECTIVE_PATTERNS as string[]).includes(pattern);
      const geometric = (GEOMETRIC_PATTERNS as string[]).includes(pattern);

      /*
       * The rest — LIQUIDITY_SWEEP, ORDER_BLOCK, RANGE, DOUBLE/TRIPLE tops — are
       * neither: they are real, detectable, and still a matter of degree (how
       * cleanly did price reclaim? how equal are the two tops?). They are scored,
       * but they are not forced to 1 the way objective structure is.
       */
      expect(
        objective && geometric,
        `${pattern} is classified as both objective and geometric`,
      ).toBe(false);
    }
  });

  it("every pattern has plain-English words a trader can read", () => {
    // A pattern the strategy editor cannot describe is a pattern a user cannot
    // reason about — and the whole product promise is that they can see WHY.
    for (const pattern of patternSchema.options) {
      expect(PATTERN_WORDS[pattern], `${pattern} has no description`).toBeDefined();
      expect(PATTERN_WORDS[pattern].meaning.length).toBeGreaterThan(20);
    }
  });
});

/**
 * The invariants that stop a detector from lying about itself.
 */
describe("a detected pattern must be internally honest", () => {
  const base = {
    timeframe: "1h" as const,
    direction: "LONG" as const,
    strength: 0.5,
    detectedAt: 1_752_480_000_000,
    startedAt: 1_752_470_000_000,
    swings: [],
    triggerPrice: null,
    invalidationPrice: null,
    confirmed: true,
    breakoutPending: false,
    volumeConfirmed: null,
    evidence: ["a reason"],
    weaknesses: [],
  };

  it("an OBJECTIVE pattern cannot have a quality below 1", () => {
    // A break of structure is not "0.8 of a break". Price took out the swing high
    // or it did not. Inventing doubt to look rigorous is the mirror image of
    // inventing certainty.
    const hedged = detectedPatternSchema.safeParse({
      ...base,
      pattern: "BREAK_OF_STRUCTURE",
      quality: 0.8,
    });

    expect(hedged.success).toBe(false);

    const honest = detectedPatternSchema.safeParse({
      ...base,
      pattern: "BREAK_OF_STRUCTURE",
      quality: 1,
    });

    expect(honest.success).toBe(true);
  });

  it("a GEOMETRIC pattern with zero quality is noise, not a detection", () => {
    const result = detectedPatternSchema.safeParse({
      ...base,
      pattern: "BULL_FLAG",
      quality: 0,
    });

    expect(result.success).toBe(false);
  });

  it("a pattern cannot be awaiting a breakout before it has formed", () => {
    const result = detectedPatternSchema.safeParse({
      ...base,
      pattern: "BULL_FLAG",
      quality: 0.8,
      confirmed: false,
      breakoutPending: true,
    });

    expect(result.success).toBe(false);
  });

  it("a pattern cannot complete before it began", () => {
    const result = detectedPatternSchema.safeParse({
      ...base,
      pattern: "BULL_FLAG",
      quality: 0.8,
      detectedAt: 1_752_470_000_000,
      startedAt: 1_752_480_000_000,
    });

    expect(result.success).toBe(false);
  });
});

/**
 * Zones.
 */
describe("a zone is a band, and it cannot be nonsense", () => {
  const base = {
    kind: "RESISTANCE" as const,
    timeframe: "1h" as const,
    low: 62_300,
    high: 62_450,
    createdAt: 1_752_470_000_000,
    lastTouchedAt: 1_752_480_000_000,
    retests: 2,
    strength: 0.7,
    swings: [],
    broken: false,
  };

  it("accepts a well-formed zone", () => {
    expect(zoneSchema.safeParse(base).success).toBe(true);
  });

  it("refuses a zone whose high sits below its low", () => {
    expect(
      zoneSchema.safeParse({ ...base, low: 62_500, high: 62_300 }).success,
    ).toBe(false);
  });

  it("refuses a zone touched before it existed", () => {
    expect(
      zoneSchema.safeParse({ ...base, lastTouchedAt: 1_752_460_000_000 }).success,
    ).toBe(false);
  });

  it("allows a never-retested zone", () => {
    expect(
      zoneSchema.safeParse({ ...base, lastTouchedAt: null, retests: 0 }).success,
    ).toBe(true);
  });
});
