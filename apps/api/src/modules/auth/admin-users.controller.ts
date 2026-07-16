import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { User } from "@aegis/contracts";

import { AuthService } from "./application/auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { CurrentUser, Roles } from "./decorators/auth.decorators";

const suspendSchema = z.object({ suspended: z.boolean() });

/**
 * User administration — the operator managing accounts.
 *
 * This is real RBAC in action: `JwtAuthGuard` proves who is asking, `RolesGuard`
 * + `@Roles("ADMIN")` proves they are allowed. A TRADER hitting any of these gets
 * a 403, full stop. The service refuses self-suspension and self-deletion — an
 * admin locking themselves out leaves nobody holding the keys.
 */
@Controller("admin/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "SUPER_ADMIN")
export class AdminUsersController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(): Promise<User[]> {
    return this.auth.listUsers();
  }

  @Patch(":id/suspension")
  suspend(
    @CurrentUser("sub") actorId: string,
    @Param("id") userId: string,
    @Body() body: unknown,
  ): Promise<User> {
    const { suspended } = suspendSchema.parse(body);
    return this.auth.setSuspended(actorId, userId, suspended);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser("sub") actorId: string,
    @Param("id") userId: string,
  ): Promise<void> {
    await this.auth.deleteUser(actorId, userId);
  }
}
