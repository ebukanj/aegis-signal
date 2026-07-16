import { Module } from "@nestjs/common";

import { PrismaModule } from "../../core/database/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./application/auth.service";
import { WatchlistService } from "./application/watchlist.service";
import { UserRepository } from "./infrastructure/user.repository";
import { PasswordService } from "./domain/password.service";
import { TokenService } from "./domain/token.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

/**
 * IDENTITY & ACCESS (M16) — who is asking, and what they may do.
 *
 * The platform spent fifteen milestones deciding things about the market before
 * it knew a single user; this is where a person becomes real. It owns
 * registration, login, sessions, the password change and per-user preferences,
 * and it exports the two guards the rest of the platform composes to protect a
 * route: `JwtAuthGuard` (who) and `RolesGuard` (what).
 *
 * Passwords are hashed with Node's scrypt and never stored; sessions are small
 * HS256 tokens signed with Node's crypto — no new dependency, nothing native to
 * build on a fresh VPS.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    WatchlistService,
    UserRepository,
    PasswordService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
  // Exported so any module can guard its routes with the platform's identity —
  // the Admin console, user-scoped signals — and read the watchlist (the scan
  // reads WatchlistService to scan watched coins as priority).
  exports: [AuthService, WatchlistService, TokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
