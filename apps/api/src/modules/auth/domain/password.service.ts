import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * Passwords, hashed — never stored.
 *
 * ── Why Node's own scrypt, and not bcrypt/argon2 ──
 *
 * scrypt is a memory-hard KDF built into Node's crypto — no native addon to
 * compile, no dependency to audit, and it is the algorithm OWASP lists as an
 * acceptable password hash. A self-hosted deploy on a fresh VPS builds nothing.
 *
 * Each hash carries its OWN random salt, so two users with the same password get
 * different hashes and a stolen database cannot be attacked with one rainbow
 * table. Verification is constant-time (`timingSafeEqual`) so a response cannot
 * be timed to learn how much of a guess was right.
 *
 * The stored form is `salt:derivedKey`, both hex — everything needed to verify,
 * nothing that reveals the password.
 */
@Injectable()
export class PasswordService {
  private static readonly KEYLEN = 64;
  private static readonly SALTLEN = 16;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(PasswordService.SALTLEN);
    const derived = (await scryptAsync(password, salt, PasswordService.KEYLEN)) as Buffer;
    return `${salt.toString("hex")}:${derived.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [saltHex, keyHex] = stored.split(":");
    if (!saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;

    // Lengths must match before timingSafeEqual, which throws on a mismatch.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
