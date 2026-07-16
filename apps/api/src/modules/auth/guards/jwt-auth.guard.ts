import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { TokenService, type TokenClaims } from "../domain/token.service";

/** The request, once a token has been verified onto it. */
export interface AuthedRequest extends Request {
  user?: TokenClaims;
}

/**
 * The gate. A route it guards is reachable only with a valid, unexpired bearer
 * token — and it attaches the verified claims to the request so the handler knows
 * who is asking without re-reading the token.
 *
 * It distinguishes nothing about WHY a token is bad: missing, malformed, expired
 * or forged all return the same 401. A guard that explained the failure would be
 * a guard that helped an attacker.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Sign in to continue");
    }

    const claims = this.tokens.verify(header.slice("Bearer ".length).trim());
    if (!claims) {
      throw new UnauthorizedException("Your session has expired — sign in again");
    }

    request.user = claims;
    return true;
  }
}
