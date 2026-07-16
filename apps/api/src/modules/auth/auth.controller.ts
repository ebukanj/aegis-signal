import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  addToWatchlistRequestSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  updatePreferencesRequestSchema,
  watchlistCoinSchema,
  type AuthResponse,
  type User,
  type UserPreferences,
} from "@aegis/contracts";

import { AuthService } from "./application/auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/auth.decorators";

/**
 * The identity API.
 *
 * Public: register and login — the two doors into the platform. Everything else
 * is behind `JwtAuthGuard`, which proves who is asking before the handler runs.
 * The controller validates the request against the contract and hands off; it
 * decides nothing (AGENTS.md §6).
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: unknown): Promise<AuthResponse> {
    return this.auth.register(registerRequestSchema.parse(body));
  }

  @Post("login")
  @HttpCode(200)
  login(@Body() body: unknown): Promise<AuthResponse> {
    return this.auth.login(loginRequestSchema.parse(body));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser("sub") userId: string): Promise<User> {
    return this.auth.me(userId);
  }

  @Post("change-password")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser("sub") userId: string,
    @Body() body: unknown,
  ): Promise<void> {
    await this.auth.changePassword(userId, changePasswordRequestSchema.parse(body));
  }

  @Get("me/preferences")
  @UseGuards(JwtAuthGuard)
  preferences(@CurrentUser("sub") userId: string): Promise<UserPreferences> {
    return this.auth.preferences(userId);
  }

  @Put("me/preferences")
  @UseGuards(JwtAuthGuard)
  updatePreferences(
    @CurrentUser("sub") userId: string,
    @Body() body: unknown,
  ): Promise<UserPreferences> {
    return this.auth.updatePreferences(userId, updatePreferencesRequestSchema.parse(body));
  }

  /* ── Watchlist ───────────────────────────────────────────────────── */

  @Get("me/watchlist")
  @UseGuards(JwtAuthGuard)
  watchlist(@CurrentUser("sub") userId: string): Promise<string[]> {
    return this.auth.watchlist(userId);
  }

  @Post("me/watchlist")
  @UseGuards(JwtAuthGuard)
  addToWatchlist(
    @CurrentUser("sub") userId: string,
    @Body() body: unknown,
  ): Promise<string[]> {
    const { coin } = addToWatchlistRequestSchema.parse(body);
    return this.auth.addToWatchlist(userId, coin);
  }

  @Delete("me/watchlist/:coin")
  @UseGuards(JwtAuthGuard)
  removeFromWatchlist(
    @CurrentUser("sub") userId: string,
    @Param("coin") coin: string,
  ): Promise<string[]> {
    return this.auth.removeFromWatchlist(userId, watchlistCoinSchema.parse(coin));
  }
}
