import { apiGet, apiSend } from "@/lib/api";
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdatePreferencesRequest,
  User,
  UserPreferences,
} from "@aegis/contracts";

/**
 * Identity data access — LIVE (M16). Every call hits the real auth API; the
 * bearer token is attached by `lib/api.ts` once a session exists.
 */
export const authApi = {
  register: (body: RegisterRequest): Promise<AuthResponse> =>
    apiSend<AuthResponse>("/auth/register", body),

  login: (body: LoginRequest): Promise<AuthResponse> =>
    apiSend<AuthResponse>("/auth/login", body),

  me: (): Promise<User> => apiGet<User>("/auth/me"),

  changePassword: (body: ChangePasswordRequest): Promise<void> =>
    apiSend<void>("/auth/change-password", body),

  getPreferences: (): Promise<UserPreferences> =>
    apiGet<UserPreferences>("/auth/me/preferences"),

  updatePreferences: (body: UpdatePreferencesRequest): Promise<UserPreferences> =>
    apiSend<UserPreferences>("/auth/me/preferences", body, "PUT"),
};
