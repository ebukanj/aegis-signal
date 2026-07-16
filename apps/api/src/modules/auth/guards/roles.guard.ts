import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@aegis/contracts";

import { ROLES_KEY } from "../decorators/auth.decorators";
import type { AuthedRequest } from "./jwt-auth.guard";

/**
 * The second gate: authenticated is not the same as authorised.
 *
 * `JwtAuthGuard` proves WHO is asking; this proves they are ALLOWED. It reads the
 * `@Roles()` list off the handler and refuses anyone whose role is not on it. A
 * route with no `@Roles()` places no role requirement — any signed-in user passes
 * — so the guard is safe to apply broadly and only bites where a role is declared.
 *
 * Order matters: this must run AFTER JwtAuthGuard, which is what put the role on
 * the request. Applied together, JwtAuthGuard first.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const role = request.user?.role as UserRole | undefined;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException("You do not have permission to do that");
    }

    return true;
  }
}
