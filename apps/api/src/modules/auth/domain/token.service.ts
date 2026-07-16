import { Injectable, type OnModuleInit } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

import { AppConfigService } from "../../../config/app-config.service";

/** What a verified token proves: who the bearer is, and their role. */
export interface TokenClaims {
  sub: string;
  email: string;
  role: string;
}

/**
 * Session tokens — a small, dependency-free HS256 JWT.
 *
 * ── Why hand-rolled, and why that is safe here ──
 *
 * A JWT is three base64url segments joined by dots, the third an HMAC of the
 * first two. That is the entire format, and Node's `crypto` signs and verifies it
 * in a dozen lines — no `jsonwebtoken`, no `jose`, no dependency to keep patched.
 * The one rule that makes hand-rolled JWTs dangerous is trusting the header's
 * `alg`; we never read it. The algorithm is fixed at HS256 in code, so the
 * "alg=none" and algorithm-confusion attacks have no surface here.
 *
 * The signature is compared in constant time. An expired or tampered token
 * verifies to null — the guard treats null as "not signed in", never as an error
 * a caller could probe.
 */
@Injectable()
export class TokenService implements OnModuleInit {
  private secret = "";

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    // JWT_SECRET is a REQUIRED, validated env var (the schema rejects a missing or
    // placeholder value in production), so it is always present and real here.
    this.secret = this.config.auth.jwtSecret;
  }

  /** Sign claims into a token valid for the configured TTL. Returns token + expiry. */
  sign(claims: TokenClaims): { token: string; expiresAt: number } {
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec + this.config.auth.jwtTtlSeconds;

    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ ...claims, iat: nowSec, exp }));
    const signature = this.hmac(`${header}.${payload}`);

    return { token: `${header}.${payload}.${signature}`, expiresAt: exp * 1000 };
  }

  /** Verify a token and return its claims, or null if invalid/expired/tampered. */
  verify(token: string): TokenClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;

    const expected = this.hmac(`${header}.${payload}`);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (typeof decoded.exp === "number" && decoded.exp < Math.floor(Date.now() / 1000)) {
        return null; // expired
      }
      if (!decoded.sub || !decoded.role) return null;
      return { sub: decoded.sub, email: decoded.email, role: decoded.role };
    } catch {
      return null;
    }
  }

  private hmac(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
