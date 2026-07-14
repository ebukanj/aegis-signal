import { Logger } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * The contract, enforced on the way out.
 *
 * `packages/contracts` is not documentation of the API — it *is* the API
 * (ADR-022). This is the function that makes that true rather than aspirational.
 *
 * TypeScript types vanish at runtime. A service that returns
 * `confidence: "87"` as a string, or omits `stopLoss`, or emits a SHORT signal
 * marked SPOT, compiles perfectly and then puts a broken trade in front of a
 * trader. The schema catches it here, in our logs, where it costs us an alert
 * instead of costing them money (Founding Principle 13 — Fail Safely).
 *
 *     return contract(signalDetailResponseSchema, await this.signals.findOne(id));
 *
 * It throws rather than repairing. A response we cannot vouch for is not a
 * response we should send — half a signal is worse than none, because it looks
 * like a whole one.
 */
const logger = new Logger("Contract");

export function contract<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const violations = result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );

    // This is our bug, not the caller's. Log it as loudly as it deserves.
    logger.error(
      {
        violations,
        // The payload itself, so the failure is debuggable without a repro.
        payload,
      },
      "Response violated its contract and was not sent",
    );

    throw new ContractViolationError(violations);
  }

  return result.data;
}

/**
 * Deliberately not a `DomainError`: this is never the caller's fault, and it
 * must surface as a 500. A contract violation means the backend is broken.
 */
export class ContractViolationError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Response violated its contract: ${violations.join("; ")}`);
    this.name = "ContractViolationError";
    this.violations = violations;
  }
}
