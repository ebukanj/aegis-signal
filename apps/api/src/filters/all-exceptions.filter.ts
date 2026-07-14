import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ContractViolationError } from "../common/contract";
import {
  DOMAIN_ERROR_STATUS,
  DomainError,
} from "../common/errors/domain-error";

/**
 * One error shape, for everything.
 *
 * The rule this enforces, and the reason it exists:
 *
 *   **A 500 tells the client nothing, and the logs tell us everything.**
 *
 * An unexpected error is a bug in our code. Its message may contain a table
 * name, a query, a file path, or a fragment of somebody's data — none of which
 * belongs in an HTTP response. So the client gets a request id and an apology,
 * and we get the stack trace. The request id is what joins the two: a user can
 * quote it, and we can find the exact line.
 *
 * Expected failures (DomainError) are different. Those are *answers* — "this
 * signal does not exist", "that strategy cannot run as written" — and the caller
 * is entitled to read them.
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
    requestId: string;
    timestamp: string;
    path: string;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const requestId =
      request.id ?? (request.headers["x-request-id"] as string) ?? "unknown";

    const { status, code, message, detail, isOurFault } =
      this.classify(exception);

    if (isOurFault) {
      // Our bug. Everything we know, at error level.
      this.logger.error(
        { err: exception, requestId, path: request.url, method: request.method },
        "Unhandled exception",
      );
    } else {
      // Expected. A rejected signal is not an incident.
      this.logger.warn(
        { code, requestId, path: request.url, message },
        "Request failed",
      );
    }

    const body: ApiError = {
      error: {
        code,
        message,
        ...(detail ? { detail } : {}),
        requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    response.status(status).json(body);
  }

  private classify(exception: unknown): {
    status: number;
    code: string;
    message: string;
    detail?: Record<string, unknown>;
    isOurFault: boolean;
  } {
    /* The domain speaking. The caller may read this. */
    if (exception instanceof DomainError) {
      return {
        status: DOMAIN_ERROR_STATUS[exception.code],
        code: exception.code,
        message: exception.message,
        detail: exception.detail,
        isOurFault: false,
      };
    }

    /*
     * The API tried to send something that violated its own contract. This is
     * always our bug and it must never be softened into a 4xx — a 4xx would tell
     * the client they did something wrong, and they did not.
     */
    if (exception instanceof ContractViolationError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: "CONTRACT_VIOLATION",
        message: "The server produced a response it could not vouch for.",
        isOurFault: true,
      };
    }

    /* Nest's own exceptions (guards, pipes, 404s). */
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Nest hands back `string | string[]` here. Left alone, an array lands in
      // the JSON as an array and every client has to handle both shapes — so the
      // error contract would be "a string, unless it isn't". One shape, always.
      const raw =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] }).message ??
              exception.message);

      return {
        status,
        code: this.codeForStatus(status),
        message: Array.isArray(raw) ? raw.join("; ") : raw,
        detail:
          typeof body === "object" && body !== null
            ? (body as Record<string, unknown>)
            : undefined,
        isOurFault: status >= 500,
      };
    }

    /* Prisma. Translated, never leaked — the raw message names tables. */
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.classifyPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: "DATABASE_ERROR",
        message: "The request could not be completed.",
        isOurFault: true,
      };
    }

    /* Anything else is a bug we have not met yet. */
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side.",
      isOurFault: true,
    };
  }

  private classifyPrisma(
    exception: Prisma.PrismaClientKnownRequestError,
  ): ReturnType<AllExceptionsFilter["classify"]> {
    switch (exception.code) {
      case "P2002": // unique constraint
        return {
          status: HttpStatus.CONFLICT,
          code: "CONFLICT",
          message: "That already exists.",
          isOurFault: false,
        };
      case "P2025": // record not found
        return {
          status: HttpStatus.NOT_FOUND,
          code: "NOT_FOUND",
          message: "That does not exist.",
          isOurFault: false,
        };
      case "P2003": // foreign key
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: "RULE_VIOLATION",
          message: "That would break a relationship between records.",
          isOurFault: false,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: "DATABASE_ERROR",
          message: "The request could not be completed.",
          isOurFault: true,
        };
    }
  }

  private codeForStatus(status: number): string {
    const map: Record<number, string> = {
      400: "INVALID_INPUT",
      401: "UNAUTHENTICATED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "RULE_VIOLATION",
      429: "RATE_LIMITED",
      503: "UNAVAILABLE",
    };
    return map[status] ?? "INTERNAL_ERROR";
  }
}
