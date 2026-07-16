import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type { UserRole } from "@aegis/contracts";

import type { AuthedRequest } from "../guards/jwt-auth.guard";
import type { TokenClaims } from "../domain/token.service";

/** Metadata key the RolesGuard reads. */
export const ROLES_KEY = "aegis:roles";

/**
 * Restrict a route to specific roles. Pair with `RolesGuard`. With no roles the
 * route is open to any authenticated user (JwtAuthGuard still applies).
 *
 *   @Roles("ADMIN")   — admins only
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Inject the verified caller into a handler. `@CurrentUser() user` gives the
 * whole claims object; `@CurrentUser("sub") id` gives one field. Only meaningful
 * behind `JwtAuthGuard`, which is what put the user on the request.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof TokenClaims | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
