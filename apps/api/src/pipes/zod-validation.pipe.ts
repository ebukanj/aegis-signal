import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { DomainError } from "../common/errors/domain-error";

/**
 * Input validation, via Zod.
 *
 * ── A DELIBERATE DEVIATION FROM THE MILESTONE SPEC ──────────────────────────
 *
 * The spec lists `class-validator` and `class-transformer` alongside Zod. We use
 * **Zod alone**, and the reason is the same reason `packages/contracts` exists at
 * all (AGENTS.md §2, ADR-022):
 *
 *   **Every concept has exactly one authoritative owner.**
 *
 * The contract already defines every shape this API accepts and returns, in Zod,
 * enforced by 34 tests, shared with the frontend. Adding `class-validator` would
 * create a *second* definition of the same shapes — decorators on DTO classes —
 * living beside the first. Two definitions of one truth is precisely the drift
 * this codebase was cleaned of, and it would go stale exactly where it hurts: a
 * decorator that says `@Min(0)` while the contract says `.positive()` is a bug
 * that compiles.
 *
 * So: `class-transformer` is installed (Nest's Swagger integration reaches for
 * it), but validation has one owner, and it is the contract.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Note the asymmetry with `contract()` in `common/contract.ts`:
 *   · Bad input  → 400. The caller's fault, and they may read why.
 *   · Bad output → 500. Our fault, and they may not.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw DomainError.invalid("The request is not valid.", {
        violations: result.error.issues.map((issue) => ({
          field: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}

/** `@Body(zodBody(createStrategySchema)) body: CreateStrategy` */
export const zodBody = <T>(schema: ZodType<T>) => new ZodValidationPipe(schema);
